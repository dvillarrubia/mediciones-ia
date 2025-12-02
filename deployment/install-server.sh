#!/bin/bash

# ========================================
# Script de Instalación del Servidor
# Mediciones IA - Ubuntu 20.04+
# ========================================
# Uso: curl -fsSL [URL] | bash
# O: chmod +x install-server.sh && ./install-server.sh

set -e

echo "╔═══════════════════════════════════════════╗"
echo "║   Instalación Servidor Mediciones IA      ║"
echo "║   Ubuntu 20.04+ / Debian 11+              ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_info() { echo -e "${BLUE}ℹ${NC} $1"; }

# Verificar que es root
if [[ $EUID -ne 0 ]]; then
   print_error "Este script debe ejecutarse como root"
   echo "Usa: sudo ./install-server.sh"
   exit 1
fi

print_success "Ejecutando como root"

# Paso 1: Actualizar sistema
echo ""
echo "═══ Paso 1/8: Actualizar sistema ═══"
print_info "Actualizando paquetes del sistema..."
apt update -qq
apt upgrade -y -qq
print_success "Sistema actualizado"

# Paso 2: Instalar utilidades básicas
echo ""
echo "═══ Paso 2/8: Utilidades básicas ═══"
print_info "Instalando curl, git, build-essential..."
apt install -y curl git build-essential software-properties-common
print_success "Utilidades instaladas"

# Paso 3: Instalar Node.js 20
echo ""
echo "═══ Paso 3/8: Node.js ═══"
print_info "Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
print_success "Node.js $NODE_VERSION instalado"
print_success "npm $NPM_VERSION instalado"

# Paso 4: Instalar PM2
echo ""
echo "═══ Paso 4/8: PM2 ═══"
print_info "Instalando PM2..."
npm install -g pm2
PM2_VERSION=$(pm2 --version)
print_success "PM2 $PM2_VERSION instalado"

# Paso 5: Instalar Nginx
echo ""
echo "═══ Paso 5/8: Nginx ═══"
print_info "Instalando Nginx..."
apt install -y nginx
systemctl enable nginx
systemctl start nginx
NGINX_VERSION=$(nginx -v 2>&1 | cut -d'/' -f2)
print_success "Nginx $NGINX_VERSION instalado"

# Paso 6: Instalar Certbot (SSL)
echo ""
echo "═══ Paso 6/8: Certbot (SSL) ═══"
print_info "Instalando Certbot para SSL..."
apt install -y certbot python3-certbot-nginx
CERTBOT_VERSION=$(certbot --version 2>&1 | cut -d' ' -f2)
print_success "Certbot $CERTBOT_VERSION instalado"

# Paso 7: Configurar Firewall
echo ""
echo "═══ Paso 7/8: Firewall ═══"
print_info "Configurando UFW..."
if command -v ufw &> /dev/null; then
    ufw --force enable
    ufw allow 22/tcp comment 'SSH'
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'
    print_success "Firewall configurado"
else
    print_warning "UFW no disponible, saltar configuración"
fi

# Paso 8: Crear directorios
echo ""
echo "═══ Paso 8/8: Estructura de directorios ═══"
print_info "Creando directorios..."
mkdir -p /var/www
mkdir -p /var/backups/mediciones-ia
mkdir -p /var/log/mediciones-ia
print_success "Directorios creados"

# Mostrar información del servidor
echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║      Instalación Completada! 🎉           ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "📋 Información del servidor:"
echo "   • Sistema: $(lsb_release -d | cut -f2)"
echo "   • Kernel: $(uname -r)"
echo "   • Node.js: $NODE_VERSION"
echo "   • npm: $NPM_VERSION"
echo "   • PM2: $PM2_VERSION"
echo "   • Nginx: $NGINX_VERSION"
echo "   • Certbot: $CERTBOT_VERSION"
echo ""
echo "📁 Directorios:"
echo "   • Aplicación: /var/www/"
echo "   • Backups: /var/backups/mediciones-ia/"
echo "   • Logs: /var/log/mediciones-ia/"
echo ""
echo "🔥 Firewall:"
if command -v ufw &> /dev/null; then
    ufw status | grep -E "Status|22|80|443"
fi
echo ""
echo "📝 Próximos pasos:"
echo "   1. Subir tu aplicación a /var/www/mediciones-ia/"
echo "   2. Configurar variables de entorno (.env)"
echo "   3. Ejecutar: npm install --production"
echo "   4. Ejecutar: npm run build"
echo "   5. Iniciar con PM2: pm2 start deployment/pm2.config.js"
echo "   6. Configurar Nginx (ver deployment/nginx.conf)"
echo "   7. Configurar SSL: certbot --nginx -d tu-dominio.com"
echo ""
print_success "¡Servidor listo para deployment!"
echo ""

# Mostrar IP del servidor
SERVER_IP=$(curl -s ifconfig.me || echo "No disponible")
echo "🌐 IP del servidor: $SERVER_IP"
echo ""
echo "Ahora puedes conectarte con:"
echo "   ssh root@$SERVER_IP"
echo ""
