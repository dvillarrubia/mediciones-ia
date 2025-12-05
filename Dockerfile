# ===========================================
# Stage 1: Build Frontend
# ===========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar todas las dependencias (incluyendo devDependencies para build)
RUN npm ci

# Copiar código fuente
COPY . .

# Construir frontend
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

# ===========================================
# Stage 2: Production Image
# ===========================================
FROM node:20-alpine AS production

# Instalar dependencias del sistema necesarias para sqlite3 y puppeteer
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

# Variables de entorno para Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copiar package.json para producción
COPY package*.json ./

# Instalar dependencias de producción + tsx para ejecutar TypeScript
RUN npm ci --omit=dev && npm install tsx

# Copiar código del backend (TypeScript)
COPY api ./api
COPY tsconfig.json ./

# Copiar frontend compilado desde el builder
COPY --from=builder /app/dist ./dist

# Crear directorios para datos persistentes
RUN mkdir -p /app/api/data/analyses /app/api/data/configurations /app/api/data/projects

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3003

# Exponer puerto
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3003/api/health || exit 1

# Comando para iniciar la aplicación con tsx
CMD ["npx", "tsx", "api/server.ts"]
