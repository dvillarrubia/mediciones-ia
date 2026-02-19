# ===========================================
# Stage 1: Builder (compila frontend + backend)
# ===========================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build: type check + vite (frontend) + tsc (backend)
RUN npm run build

# ===========================================
# Stage 2: Nginx (sirve frontend estático)
# ===========================================
FROM nginx:alpine AS nginx

COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# ===========================================
# Stage 3: API (backend compilado a JS)
# ===========================================
FROM node:20-alpine AS api

# Dependencias del sistema para sqlite3 nativo y Puppeteer (PDFs)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Backend compilado (JS puro, sin tsx)
COPY --from=builder /app/dist-api ./dist-api

# Directorios para datos persistentes
RUN mkdir -p /app/data/analyses /app/data/configurations /app/data/projects

ENV NODE_ENV=production
ENV PORT=3003

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3003/api/health || exit 1

CMD ["node", "dist-api/server.js"]
