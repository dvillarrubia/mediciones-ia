#!/bin/bash

# ===========================================
# Script de Despliegue para VPS con Docker
# ===========================================

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Despliegue de Mediciones IA - Docker  ${NC}"
echo -e "${GREEN}=========================================${NC}"

# Verificar que Docker está instalado
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker no está instalado${NC}"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose no está instalado${NC}"
    exit 1
fi

# Verificar archivo .env
if [ ! -f .env ]; then
    echo -e "${YELLOW}Archivo .env no encontrado. Creando desde .env.docker...${NC}"
    cp .env.docker .env
    echo -e "${RED}IMPORTANTE: Edita el archivo .env con tus API keys antes de continuar${NC}"
    echo -e "Ejecuta: nano .env"
    exit 1
fi

# Verificar que OPENAI_API_KEY está configurada
if grep -q "your_openai_api_key_here" .env; then
    echo -e "${RED}Error: Debes configurar OPENAI_API_KEY en el archivo .env${NC}"
    exit 1
fi

# Modo de despliegue
MODE=${1:-"standard"}

echo -e "${YELLOW}Modo de despliegue: ${MODE}${NC}"

case $MODE in
    "standard")
        echo -e "${GREEN}Desplegando en modo estándar...${NC}"
        docker compose down --remove-orphans 2>/dev/null || true
        docker compose build --no-cache
        docker compose up -d
        ;;
    "prod")
        echo -e "${GREEN}Desplegando en modo producción con Traefik...${NC}"
        docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true
        docker compose -f docker-compose.prod.yml build --no-cache
        docker compose -f docker-compose.prod.yml up -d
        ;;
    "with-nginx")
        echo -e "${GREEN}Desplegando con Nginx...${NC}"
        docker compose --profile with-nginx down --remove-orphans 2>/dev/null || true
        docker compose --profile with-nginx build --no-cache
        docker compose --profile with-nginx up -d
        ;;
    "update")
        echo -e "${GREEN}Actualizando sin reconstruir...${NC}"
        docker compose pull 2>/dev/null || true
        docker compose up -d
        ;;
    "rebuild")
        echo -e "${GREEN}Reconstruyendo imagen...${NC}"
        docker compose build --no-cache
        docker compose up -d
        ;;
    *)
        echo -e "${RED}Modo no reconocido: ${MODE}${NC}"
        echo "Uso: $0 [standard|prod|with-nginx|update|rebuild]"
        exit 1
        ;;
esac

# Esperar a que el servicio esté listo
echo -e "${YELLOW}Esperando a que el servicio esté listo...${NC}"
sleep 10

# Verificar health
echo -e "${YELLOW}Verificando estado del servicio...${NC}"
HEALTH_CHECK=$(curl -s http://localhost:3003/api/health 2>/dev/null || echo '{"success":false}')

if echo "$HEALTH_CHECK" | grep -q '"success":true'; then
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  Despliegue completado exitosamente!   ${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo -e "La aplicación está disponible en:"
    echo -e "  - Local: ${GREEN}http://localhost:3003${NC}"
    if [ -n "$DOMAIN" ]; then
        echo -e "  - Dominio: ${GREEN}https://${DOMAIN}${NC}"
    fi
    echo ""
    echo -e "Comandos útiles:"
    echo -e "  - Ver logs: ${YELLOW}docker compose logs -f${NC}"
    echo -e "  - Detener: ${YELLOW}docker compose down${NC}"
    echo -e "  - Reiniciar: ${YELLOW}docker compose restart${NC}"
else
    echo -e "${RED}=========================================${NC}"
    echo -e "${RED}  Error: El servicio no responde        ${NC}"
    echo -e "${RED}=========================================${NC}"
    echo ""
    echo "Revisa los logs con: docker compose logs -f"
    exit 1
fi
