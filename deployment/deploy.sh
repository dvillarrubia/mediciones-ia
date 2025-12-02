#!/bin/bash

# ========================================
# Script de Deployment Automatizado
# Mediciones IA - Producción
# ========================================
# Uso: ./deploy.sh

set -e  # Salir si hay algún error

echo "╔════════════════════════════════════════╗"
echo "║   Deployment Mediciones IA v1.0        ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Variables
APP_DIR="/var/www/mediciones-ia"
BACKUP_DIR="/var/backups/mediciones-ia"
DATE=$(date +%Y%m%d_%H%M%S)

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funciones auxiliares
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "ℹ $1"
}

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    print_error "No se encontró package.json. ¿Estás en el directorio correcto?"
    exit 1
fi

print_success "Directorio verificado"

# Paso 1: Backup antes de deployment
echo ""
echo "═══ Paso 1: Backup de seguridad ═══"
if [ -f "data/analysis.db" ]; then
    mkdir -p $BACKUP_DIR
    cp data/analysis.db "$BACKUP_DIR/analysis_pre_deploy_$DATE.db"
    print_success "Backup de base de datos creado"
else
    print_warning "No se encontró base de datos para backup"
fi

# Paso 2: Git pull (si usas Git)
echo ""
echo "═══ Paso 2: Actualizar código ═══"
if [ -d ".git" ]; then
    print_info "Actualizando desde Git..."
    git pull origin main
    print_success "Código actualizado"
else
    print_warning "No se usa Git, saltar actualización"
fi

# Paso 3: Instalar/Actualizar dependencias
echo ""
echo "═══ Paso 3: Dependencias ═══"
print_info "Instalando dependencias de producción..."
npm install --production
print_success "Dependencias instaladas"

# Paso 4: Build del frontend
echo ""
echo "═══ Paso 4: Build del frontend ═══"
print_info "Compilando frontend..."
npm run build

if [ -d "dist" ]; then
    print_success "Frontend compilado exitosamente"
else
    print_error "Error al compilar frontend"
    exit 1
fi

# Paso 5: Verificar variables de entorno
echo ""
echo "═══ Paso 5: Variables de entorno ═══"
if [ -f ".env" ]; then
    print_success "Archivo .env encontrado"
else
    print_warning "No se encontró .env, copia .env.production.example"
    if [ -f "deployment/.env.production.example" ]; then
        cp deployment/.env.production.example .env
        print_info "Archivo .env creado desde ejemplo"
        print_warning "IMPORTANTE: Edita .env con tus claves reales"
    fi
fi

# Paso 6: Verificar/Crear directorio de datos
echo ""
echo "═══ Paso 6: Base de datos ═══"
if [ ! -d "data" ]; then
    mkdir -p data
    print_info "Directorio data/ creado"
fi

if [ ! -f "data/analysis.db" ]; then
    touch data/analysis.db
    print_info "Base de datos SQLite creada"
fi

# Ajustar permisos
chown -R www-data:www-data data/ 2>/dev/null || print_warning "No se pudieron ajustar permisos (puede requerir sudo)"
chmod -R 755 data/ 2>/dev/null || true

print_success "Base de datos verificada"

# Paso 7: Reiniciar PM2
echo ""
echo "═══ Paso 7: Reiniciar aplicación ═══"
print_info "Reiniciando PM2..."

if command -v pm2 &> /dev/null; then
    pm2 restart deployment/pm2.config.js
    print_success "Aplicación reiniciada"

    # Mostrar status
    echo ""
    pm2 list
else
    print_error "PM2 no está instalado"
    print_info "Instala con: npm install -g pm2"
    exit 1
fi

# Paso 8: Verificar salud de la aplicación
echo ""
echo "═══ Paso 8: Health Check ═══"
sleep 5  # Esperar a que la app arranque

if curl -f http://localhost:3003/api/health &> /dev/null; then
    print_success "API respondiendo correctamente"
else
    print_error "API no responde en http://localhost:3003"
    print_info "Revisa los logs con: pm2 logs"
fi

# Paso 9: Reiniciar Nginx (si es necesario)
echo ""
echo "═══ Paso 9: Nginx ═══"
if command -v nginx &> /dev/null; then
    if nginx -t &> /dev/null; then
        systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true
        print_success "Nginx recargado"
    else
        print_warning "Configuración de Nginx tiene errores"
    fi
else
    print_warning "Nginx no está instalado"
fi

# Resumen final
echo ""
echo "╔════════════════════════════════════════╗"
echo "║      Deployment Completado! 🎉         ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "📋 Próximos pasos:"
echo "   1. Verifica tu sitio en el navegador"
echo "   2. Revisa logs: pm2 logs"
echo "   3. Monitor: pm2 monit"
echo ""
echo "📊 Estado actual:"
pm2 status mediciones-ia-api 2>/dev/null || pm2 list
echo ""
print_success "Todo listo!"
