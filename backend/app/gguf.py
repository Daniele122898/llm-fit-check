"""Minimal GGUF header reader, designed for HTTP-range-fetched prefixes.

A .gguf file is laid out sequentially (little-endian):

    magic "GGUF" | u32 version | u64 tensor_count | u64 metadata_kv_count |
    metadata KVs ... | tensor infos ... | aligned tensor data

Each metadata KV is a length-prefixed string key, a u32 value type, and a
typed value. Writers emit the architecture keys (general.architecture,
{arch}.block_count, attention.head_count, ...) before the multi-megabyte
tokenizer arrays, so the first ~128 KB of the file is normally enough — we
parse as far as the buffer allows and report whether we ran dry, letting the
caller decide to fetch a bigger prefix.

The official `gguf` package needs a local memory-mapped file, which is why
this exists.
"""

import struct

GGUF_MAGIC = b"GGUF"

(T_UINT8, T_INT8, T_UINT16, T_INT16, T_UINT32, T_INT32, T_FLOAT32, T_BOOL,
 T_STRING, T_ARRAY, T_UINT64, T_INT64, T_FLOAT64) = range(13)

_SCALARS = {
    T_UINT8: ("<B", 1), T_INT8: ("<b", 1),
    T_UINT16: ("<H", 2), T_INT16: ("<h", 2),
    T_UINT32: ("<I", 4), T_INT32: ("<i", 4),
    T_FLOAT32: ("<f", 4), T_BOOL: ("<?", 1),
    T_UINT64: ("<Q", 8), T_INT64: ("<q", 8), T_FLOAT64: ("<d", 8),
}

# Keep small arrays (per-layer head counts etc.); skim past tokenizer vocab.
MAX_ARRAY_KEEP = 512


class NeedMoreData(Exception):
    """The buffer ended mid-value — fetch a larger prefix and retry."""


class _Reader:
    def __init__(self, buf: bytes):
        self.buf = buf
        self.off = 0

    def take(self, n: int) -> bytes:
        if self.off + n > len(self.buf):
            raise NeedMoreData()
        b = self.buf[self.off:self.off + n]
        self.off += n
        return b

    def skip(self, n: int) -> None:
        if self.off + n > len(self.buf):
            raise NeedMoreData()
        self.off += n

    def scalar(self, t: int):
        fmt, size = _SCALARS[t]
        return struct.unpack(fmt, self.take(size))[0]

    def string(self) -> str:
        n = self.scalar(T_UINT64)
        if n > 1 << 24:
            raise ValueError("implausible string length — corrupt header")
        return self.take(n).decode("utf-8", errors="replace")

    def value(self, t: int):
        if t == T_STRING:
            return self.string()
        if t == T_ARRAY:
            elem_t = self.scalar(T_UINT32)
            count = self.scalar(T_UINT64)
            if elem_t in _SCALARS and count > MAX_ARRAY_KEEP:
                self.skip(count * _SCALARS[elem_t][1])
                return None  # large scalar array we don't care about
            out = []
            for i in range(count):
                v = self.value(elem_t)
                if i < MAX_ARRAY_KEEP:
                    out.append(v)
            return out if len(out) == count else None
        if t in _SCALARS:
            return self.scalar(t)
        raise ValueError(f"unknown GGUF value type {t}")


def parse_gguf_meta(buf: bytes):
    """Parse metadata KVs out of a file prefix.

    Returns (meta, complete). `complete` is False when the buffer ended
    mid-metadata — the keys gathered so far are still valid.
    Raises ValueError for non-GGUF / unsupported / corrupt input.
    """
    r = _Reader(buf)
    try:
        if r.take(4) != GGUF_MAGIC:
            raise ValueError("not a GGUF file")
        version = r.scalar(T_UINT32)
        if version not in (2, 3):
            raise ValueError(f"unsupported GGUF version {version}")
        r.scalar(T_UINT64)  # tensor_count
        n_kv = r.scalar(T_UINT64)
        if n_kv > 65536:
            raise ValueError("implausible metadata count — corrupt header")
    except NeedMoreData:
        raise ValueError("buffer too small for GGUF header") from None

    meta = {}
    complete = True
    for _ in range(n_kv):
        try:
            key = r.string()
            t = r.scalar(T_UINT32)
            meta[key] = r.value(t)
        except NeedMoreData:
            complete = False
            break
    return meta, complete
