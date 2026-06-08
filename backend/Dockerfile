# ============================================================
# Cenli DPE Backend — Cloud Run Dockerfile
# ============================================================
# Build:   docker build -t cenli-dpe-backend .
# Run:     docker run -p 8000:8000 --env-file .env cenli-dpe-backend
# Deploy:  gcloud run deploy cenli-dpe-backend --source .
# ============================================================

FROM python:3.13-slim

# Install Node.js 20 LTS (required for npx @arizeai/phoenix-mcp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Pre-cache the Phoenix MCP npx package so first run is instant
RUN npx -y @arizeai/phoenix-mcp@latest --help || true

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY src/ ./src/
COPY .env.example .env.example

# Cloud Run injects PORT env var; default to 8000
ENV PORT=8000
ENV HOST=0.0.0.0

EXPOSE 8080

# Use PORT from environment (Cloud Run sets this to 8080)
CMD ["sh", "-c", "uvicorn src.server:app --host $HOST --port ${PORT:-8080}"]
