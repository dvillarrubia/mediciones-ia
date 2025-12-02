#!/bin/bash

# ===========================================
# Script de Backup de Datos SQLite
# ===========================================

set -e

# Configuración
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
CONTAINER_NAME="mediciones-ia-app"

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Backup de Base de Datos               ${NC}"
echo -e "${GREEN}=========================================${NC}"

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

# Verificar que el contenedor está corriendo
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}El contenedor no está corriendo. Intentando backup desde volumen...${NC}"

    # Backup desde volumen directamente
    docker run --rm \
        -v mediciones_ia_sqlite_data:/data \
        -v "$(pwd)/${BACKUP_DIR}":/backup \
        alpine \
        sh -c "cp /data/*.db /backup/analysis_${TIMESTAMP}.db 2>/dev/null || echo 'No database found'"
else
    # Backup desde contenedor en ejecución
    echo -e "${YELLOW}Creando backup desde contenedor...${NC}"
    docker exec "$CONTAINER_NAME" cp /app/data/analysis.db /tmp/analysis_backup.db 2>/dev/null || true
    docker cp "$CONTAINER_NAME:/tmp/analysis_backup.db" "$BACKUP_DIR/analysis_${TIMESTAMP}.db" 2>/dev/null || echo "No database to backup"
fi

# Verificar si el backup fue exitoso
if [ -f "$BACKUP_DIR/analysis_${TIMESTAMP}.db" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/analysis_${TIMESTAMP}.db" | cut -f1)
    echo -e "${GREEN}Backup creado exitosamente:${NC}"
    echo -e "  Archivo: $BACKUP_DIR/analysis_${TIMESTAMP}.db"
    echo -e "  Tamaño: $BACKUP_SIZE"

    # Limpiar backups antiguos (mantener últimos 7)
    echo -e "${YELLOW}Limpiando backups antiguos...${NC}"
    ls -t "$BACKUP_DIR"/analysis_*.db 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true

    TOTAL_BACKUPS=$(ls "$BACKUP_DIR"/analysis_*.db 2>/dev/null | wc -l)
    echo -e "  Backups almacenados: $TOTAL_BACKUPS"
else
    echo -e "${YELLOW}No se encontró base de datos para respaldar (puede ser una instalación nueva)${NC}"
fi

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Backup completado                     ${NC}"
echo -e "${GREEN}=========================================${NC}"
