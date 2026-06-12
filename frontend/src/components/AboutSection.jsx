import React from "react";

// Static explainer + FAQ. Real, useful copy — it's also what search engines
// and AI answer engines index and cite for "how much VRAM does X need".
export function AboutSection() {
  return (
    <section className="about" aria-label="About LLM Fit Check">
      <h2>How LLM Fit Check works</h2>
      <p>
        LLM Fit Check estimates the total memory a large language model needs —{" "}
        <b>weights + KV cache + compute buffers</b> — and compares it against your GPU VRAM,
        Apple unified memory or system RAM. Model data comes live from Hugging Face: real
        parameter counts, exact GGUF quantization file sizes, and each model's true architecture
        (layers, grouped-query attention heads, context window), including special cases like
        DeepSeek's MLA compressed KV cache and Gemma's sliding-window attention.
      </p>

      <div className="faq">
        <details>
          <summary>How much VRAM does a 7B, 13B or 70B model need?</summary>
          <p>
            At the popular Q4_K_M quantization with 8K context: a <b>7–8B model needs about
            6–7 GB</b>, a <b>13–14B model about 10–12 GB</b>, a <b>32B model about 21–23 GB</b>,
            and a <b>70B model about 43–46 GB</b>. Higher precision (Q6_K, Q8_0, FP16) and longer
            context windows push these numbers up — use the calculator above for your exact setup.
          </p>
        </details>
        <details>
          <summary>What is Q4_K_M and which GGUF quantization should I use?</summary>
          <p>
            GGUF quantizations shrink a model's weights to fewer bits per weight. <b>Q4_K_M
            (~4.85 bits/weight) is the sweet spot</b> for most people — roughly 70% smaller than
            FP16 with minimal quality loss. Q6_K and Q8_0 are near-lossless but bigger; Q2_K is a
            last resort with noticeable degradation. If a model almost fits, try the next smaller
            quant before giving up.
          </p>
        </details>
        <details>
          <summary>How is the memory estimate calculated?</summary>
          <p>
            Weights = parameters × bits-per-weight ÷ 8 (or the <b>exact published GGUF file
            size</b> when available). KV cache = 2 × layers × KV heads × head dimension × bytes ×
            context tokens — grouped-query-attention aware, using each model's real config.
            On top of that sits a compute-buffer estimate fitted to real llama.cpp runs plus a
            fixed runtime overhead. A configurable safety margin separates “fits” from “tight”.
          </p>
        </details>
        <details>
          <summary>Do MoE models like Mixtral or DeepSeek need less memory?</summary>
          <p>
            No — <b>all parameters must be in memory</b>, not just the active experts. Mixtral
            8x7B holds 46.7B parameters even though only ~13B are active per token; the active
            count makes it <i>faster</i>, not smaller. The exception is the KV cache: DeepSeek's
            MLA architecture compresses it ~28× compared to standard attention.
          </p>
        </details>
        <details>
          <summary>How much of my Mac's unified memory can a model use?</summary>
          <p>
            macOS lets the GPU wire about <b>2/3 of unified memory below 36 GB, and 3/4 from
            36 GB up</b> (Metal's recommended working-set limit, which Ollama and LM Studio
            respect). A 36 GB MacBook therefore offers ~27 GB to models — minus whatever macOS
            and your open apps already use, which you can set in the hardware panel.
          </p>
        </details>
        <details>
          <summary>Can I run a model that's bigger than my VRAM?</summary>
          <p>
            Often yes — llama.cpp-style engines can keep some layers in system RAM and run them
            on the CPU (<b>partial offload</b>). It works, but expect a steep slowdown: even a
            small spill can halve your tokens per second. LLM Fit Check shows these models with
            an orange “Offloads” verdict and how many GB would land in RAM.
          </p>
        </details>
      </div>
    </section>
  );
}
