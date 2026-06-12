# ---- build the frontend ----------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY frontend/ ./
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM python:3.13-slim
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app backend/app
COPY backend/scripts backend/scripts
COPY --from=frontend /build/dist frontend/dist

ENV FITCHECK_DB=/data/fitcheck.db
VOLUME /data

EXPOSE 8400
WORKDIR /app/backend
# --proxy-headers so request.client reflects the real IP behind the proxy
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8400", "--proxy-headers", "--forwarded-allow-ips", "*"]
