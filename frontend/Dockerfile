# ============================================================
# Cenli DPE Frontend — Cloud Run Dockerfile
# ============================================================
# Build:   docker build -t cenli-frontend .
# Run:     docker run -p 8080:8080 cenli-frontend
# Deploy:  gcloud run deploy cenli-frontend --source .
# ============================================================

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Build the app (TanStack Start production build)
RUN npm run build

# Stage 2: Production
FROM node:22-alpine

WORKDIR /app

# TanStack Start outputs the SSR server to .output/
COPY --from=builder /app/.output ./.output

# Cloud Run injects PORT=8080; default to 8080 to match
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Run the TanStack Start SSR server directly
CMD node .output/server/index.mjs
