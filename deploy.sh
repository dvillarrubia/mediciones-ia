#!/bin/bash
# ===========================================
# Script de Despliegue - Mediciones IA
# ===========================================
# Uso: ./deploy.sh [build|update|restart|logs|status]

set -e

APP_DIR="/opt/mediciones-ia"
REPO_URL="https://github.com/dvillarrubia/mediciones-ia.git"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar que Docker está instalado
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker no está instalado. Instalalo con: curl -fsSL https://get.docker.com | sh"
        exit 1
    fi
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose no está instalado"
        exit 1
    fi
}

# Primera instalación
install() {
    log_info "Instalando Mediciones IA..."

    # Crear directorio
    sudo mkdir -p $APP_DIR
    sudo chown $USER:$USER $APP_DIR

    # Clonar repositorio
    git clone $REPO_URL $APP_DIR
    cd $APP_DIR

    # Crear archivo .env
    if [ ! -f .env ]; then
        cp .env.example .env
        log_warn "Archivo .env creado. Edítalo con tus API keys: nano $APP_DIR/.env"
        exit 0
    fi

    # Construir y arrancar
    docker compose up -d --build

    log_info "Instalación completada!"
    log_info "La aplicación está disponible en http://$(hostname -I | awk '{print $1}'):3003"
}

# Actualizar a la última versión
update() {
    log_info "Actualizando Mediciones IA..."
    cd $APP_DIR

    # Guardar cambios locales si hay
    git stash

    # Descargar últimos cambios
    git pull origin main

    # Reconstruir imagen
    docker compose build --no-cache

    # Reiniciar con la nueva imagen
    docker compose up -d

    log_info "Actualización completada!"
}

# Solo reconstruir y reiniciar (sin git pull)
rebuild() {
    log_info "Reconstruyendo contenedor..."
    cd $APP_DIR
    docker compose down
    docker compose build --no-cache
    docker compose up -d
    log_info "Rebuild completado!"
}

# Reiniciar servicios
restart() {
    log_info "Reiniciando servicios..."
    cd $APP_DIR
    docker compose restart
    log_info "Servicios reiniciados!"
}

# Ver logs
logs() {
    cd $APP_DIR
    docker compose logs -f --tail=100
}

# Ver estado
status() {
    cd $APP_DIR
    docker compose ps
    echo ""
    log_info "Health check:"
    curl -s http://localhost:3003/api/health | python3 -m json.tool 2>/dev/null || echo "API no responde"
}

# Detener servicios
stop() {
    log_info "Deteniendo servicios..."
    cd $APP_DIR
    docker compose down
    log_info "Servicios detenidos!"
}

# Backup de datos
backup() {
    log_info "Creando backup..."
    BACKUP_FILE="mediciones-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    cd $APP_DIR
    docker compose exec -T app tar czf - /app/api/data > $BACKUP_FILE
    log_info "Backup creado: $BACKUP_FILE"
}

# Mostrar ayuda
help() {
    echo "Uso: ./deploy.sh [comando]"
    echo ""
    echo "Comandos disponibles:"
    echo "  install   - Primera instalación"
    echo "  update    - Actualizar desde GitHub y reconstruir"
    echo "  rebuild   - Reconstruir contenedor sin actualizar código"
    echo "  restart   - Reiniciar servicios"
    echo "  stop      - Detener servicios"
    echo "  logs      - Ver logs en tiempo real"
    echo "  status    - Ver estado de los servicios"
    echo "  backup    - Crear backup de datos"
    echo "  help      - Mostrar esta ayuda"
}

# Main
check_docker

case "${1:-help}" in
    install)
        install
        ;;
    update)
        update
        ;;
    rebuild)
        rebuild
        ;;
    restart)
        restart
        ;;
    stop)
        stop
        ;;
    logs)
        logs
        ;;
    status)
        status
        ;;
    backup)
        backup
        ;;
    help|*)
        help
        ;;
esac
