#!/bin/bash

# Script de Backup Automático para Mediciones IA
# Uso: chmod +x backup.sh && ./backup.sh
# Cron: 0 2 * * * /var/www/mediciones-ia/deployment/backup.sh

# Variables
APP_DIR="/var/www/mediciones-ia"
BACKUP_DIR="/var/backups/mediciones-ia"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Crear directorio de backups si no existe
mkdir -p $BACKUP_DIR

echo "=== Backup Mediciones IA - $DATE ==="

# Backup de la base de datos
if [ -f "$APP_DIR/data/analysis.db" ]; then
    echo "Respaldando base de datos..."
    cp "$APP_DIR/data/analysis.db" "$BACKUP_DIR/analysis_$DATE.db"
    gzip "$BACKUP_DIR/analysis_$DATE.db"
    echo "✓ Base de datos respaldada: analysis_$DATE.db.gz"
else
    echo "⚠ No se encontró la base de datos"
fi

# Backup de configuraciones personalizadas
if [ -d "$APP_DIR/data/configurations" ]; then
    echo "Respaldando configuraciones..."
    tar -czf "$BACKUP_DIR/configurations_$DATE.tar.gz" -C "$APP_DIR" data/configurations
    echo "✓ Configuraciones respaldadas: configurations_$DATE.tar.gz"
fi

# Backup de variables de entorno
if [ -f "$APP_DIR/.env" ]; then
    echo "Respaldando variables de entorno..."
    cp "$APP_DIR/.env" "$BACKUP_DIR/env_$DATE.txt"
    echo "✓ Variables respaldadas: env_$DATE.txt"
fi

# Limpiar backups antiguos
echo "Limpiando backups antiguos (más de $RETENTION_DAYS días)..."
find $BACKUP_DIR -name "*.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.txt" -mtime +$RETENTION_DAYS -delete

# Resumen
BACKUP_COUNT=$(ls -1 $BACKUP_DIR | wc -l)
BACKUP_SIZE=$(du -sh $BACKUP_DIR | cut -f1)

echo ""
echo "=== Resumen del Backup ==="
echo "Fecha: $DATE"
echo "Directorio: $BACKUP_DIR"
echo "Archivos totales: $BACKUP_COUNT"
echo "Tamaño total: $BACKUP_SIZE"
echo "=========================="
echo ""

# Log del backup
echo "$DATE - Backup completado exitosamente" >> $BACKUP_DIR/backup.log
