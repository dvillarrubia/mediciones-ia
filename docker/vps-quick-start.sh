#!/bin/bash

# ===========================================
# Quick Start para VPS con Docker ya instalado
# Ejecutar en el directorio del proyecto
# ===========================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

clear
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}   Mediciones IA - Quick Start VPS      ${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# 1. Verificar Docker
echo -e "${YELLOW}[1/5] Verificando Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker no encontrado!${NC}"
    exit 1
fi
docker --version
echo -e "${GREEN}OK${NC}"
echo ""

# 2. Verificar Docker Compose
echo -e "${YELLOW}[2/5] Verificando Docker Compose...${NC}"
if ! docker compose version &> /dev/null; then
    echo -e "${RED}Docker Compose no encontrado!${NC}"
    exit 1
fi
docker compose version
echo -e "${GREEN}OK${NC}"
echo ""

# 3. Configurar .env
echo -e "${YELLOW}[3/5] Configurando variables de entorno...${NC}"
if [ ! -f .env ]; then
    cp .env.docker .env
    echo -e "${YELLOW}Archivo .env creado desde plantilla${NC}"
    echo ""
    echo -e "${RED}IMPORTANTE: Necesitas configurar tu OPENAI_API_KEY${NC}"
    echo ""
    read -p "Ingresa tu OPENAI_API_KEY: " OPENAI_KEY
    if [ -n "$OPENAI_KEY" ]; then
        sed -i "s/your_openai_api_key_here/$OPENAI_KEY/" .env
        echo -e "${GREEN}API Key configurada${NC}"
    else
        echo -e "${RED}No se proporcionó API Key. Edita .env manualmente.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}Archivo .env ya existe${NC}"
fi
echo ""

# 4. Crear red de Traefik si no existe (para modo producción)
echo -e "${YELLOW}[4/5] Preparando red Docker...${NC}"
docker network create traefik-public 2>/dev/null || echo "Red traefik-public ya existe"
echo -e "${GREEN}OK${NC}"
echo ""

# 5. Desplegar
echo -e "${YELLOW}[5/5] Desplegando aplicación...${NC}"
echo ""
echo "Selecciona el modo de despliegue:"
echo "  1) Simple (puerto 3003 directo)"
echo "  2) Con Traefik (SSL automático, requiere dominio)"
echo ""
read -p "Opción [1]: " DEPLOY_MODE
DEPLOY_MODE=${DEPLOY_MODE:-1}

case $DEPLOY_MODE in
    1)
        echo -e "${YELLOW}Desplegando en modo simple...${NC}"
        docker compose down 2>/dev/null || true
        docker compose build
        docker compose up -d
        DEPLOY_URL="http://$(curl -s ifconfig.me 2>/dev/null || echo 'localhost'):3003"
        ;;
    2)
        echo ""
        read -p "Ingresa tu dominio (ej: mediciones.tudominio.com): " DOMAIN
        if [ -n "$DOMAIN" ]; then
            sed -i "s/DOMAIN=.*/DOMAIN=$DOMAIN/" .env
            echo -e "${YELLOW}Desplegando con Traefik...${NC}"
            docker compose -f docker-compose.prod.yml down 2>/dev/null || true
            docker compose -f docker-compose.prod.yml build
            docker compose -f docker-compose.prod.yml up -d
            DEPLOY_URL="https://$DOMAIN"
        else
            echo -e "${RED}Dominio requerido para modo Traefik${NC}"
            exit 1
        fi
        ;;
    *)
        echo -e "${RED}Opción no válida${NC}"
        exit 1
        ;;
esac

# Esperar
echo ""
echo -e "${YELLOW}Esperando a que el servicio esté listo...${NC}"
sleep 15

# Verificar
echo ""
if curl -s http://localhost:3003/api/health | grep -q "success"; then
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}   DESPLIEGUE EXITOSO!                  ${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo -e "Accede a la aplicación en:"
    echo -e "  ${BLUE}$DEPLOY_URL${NC}"
    echo ""
    echo -e "Comandos útiles:"
    echo -e "  Ver logs:    ${YELLOW}docker compose logs -f${NC}"
    echo -e "  Detener:     ${YELLOW}docker compose down${NC}"
    echo -e "  Reiniciar:   ${YELLOW}docker compose restart${NC}"
    echo -e "  Backup:      ${YELLOW}./docker/backup-data.sh${NC}"
    echo ""
else
    echo -e "${RED}=========================================${NC}"
    echo -e "${RED}   ERROR EN DESPLIEGUE                  ${NC}"
    echo -e "${RED}=========================================${NC}"
    echo ""
    echo "Revisa los logs:"
    echo "  docker compose logs -f"
    exit 1
fi
