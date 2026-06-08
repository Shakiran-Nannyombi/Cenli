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

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Cloud Run injects PORT=8080; default to 8080 to match
ENV PORT=8080
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 8080

# Use shell form so $PORT is expanded at runtime
CMD npm run preview -- --host 0.0.0.0 --port $PORT
