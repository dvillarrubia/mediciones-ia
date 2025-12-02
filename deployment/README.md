# 🚀 Guía de Deployment a Producción

## 📋 Tabla de Contenidos

1. [Requisitos Previos](#requisitos-previos)
2. [Preparación del Proyecto](#preparación-del-proyecto)
3. [Opciones de Hosting](#opciones-de-hosting)
4. [Deployment en VPS (Recomendado)](#deployment-en-vps)
5. [Deployment en Servicios Cloud](#deployment-en-servicios-cloud)
6. [Configuración Post-Deployment](#configuración-post-deployment)
7. [Mantenimiento](#mantenimiento)

---

## 📦 Requisitos Previos

### En tu Máquina Local
- Node.js v18+ instalado
- npm v9+ instalado
- Git instalado

### En el Servidor
- Ubuntu 20.04+ / Debian 11+ (o similar)
- Acceso SSH con sudo
- Dominio apuntando al servidor (opcional pero recomendado)
- Mínimo 2GB RAM, 20GB disco

---

## 🛠️ Preparación del Proyecto

### 1. Configurar Variables de Entorno

Crea el archivo `.env.production` en la raíz del proyecto:

```bash
# API de OpenAI (tu clave o dejar vacío si los usuarios usarán las suyas)
OPENAI_API_KEY=sk-tu-clave-aqui

# Puerto del servidor
PORT=3003

# Base de datos SQLite
DATABASE_PATH=./data/analysis.db

# Entorno
NODE_ENV=production

# URL base (cambiar por tu dominio)
VITE_API_BASE_URL=https://tu-dominio.com
```

### 2. Build del Proyecto

```bash
# Instalar dependencias
npm install

# Build del frontend
npm run build

# Verificar que se creó la carpeta dist/
ls -la dist/
```

### 3. Preparar Archivos para Subir

Los archivos necesarios son:
```
mediciones_IA/
├── api/                    # Backend completo
├── dist/                   # Frontend compilado
├── data/                   # Base de datos (crear si no existe)
├── node_modules/          # Dependencias (o instalar en servidor)
├── package.json
├── package-lock.json
├── .env.production        # Variables de entorno
└── deployment/            # Esta carpeta con configs
```

---

## 🌐 Opciones de Hosting

### Opción A: VPS (Recomendado) 💪
**Proveedores**: DigitalOcean, Linode, Vultr, Contabo
**Costo**: $5-10/mes
**Control**: Total
**Escalabilidad**: Alta

### Opción B: Railway.app 🚂
**Costo**: ~$5/mes + uso
**Facilidad**: Muy fácil
**Control**: Limitado
**Deployment**: Automático con Git

### Opción C: Render.com 🎨
**Costo**: Plan gratuito disponible
**Facilidad**: Fácil
**Control**: Moderado
**Deployment**: Automático con Git

### Opción D: AWS/Azure/GCP ☁️
**Costo**: Variable (puede ser alto)
**Control**: Total
**Complejidad**: Alta
**Escalabilidad**: Máxima

---

## 🖥️ Deployment en VPS

### Paso 1: Conectar al Servidor

```bash
ssh root@tu-servidor-ip
```

### Paso 2: Instalar Dependencias del Servidor

```bash
# Actualizar sistema
apt update && apt upgrade -y

# Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Instalar nginx
apt install -y nginx

# Instalar PM2 (gestor de procesos)
npm install -g pm2

# Instalar certbot (para SSL)
apt install -y certbot python3-certbot-nginx

# Verificar instalaciones
node --version
npm --version
nginx -v
pm2 --version
```

### Paso 3: Subir el Proyecto al Servidor

**Opción 3.1: Usando Git (Recomendado)**

```bash
# En el servidor
cd /var/www
git clone https://tu-repositorio.git mediciones-ia
cd mediciones-ia

# Instalar dependencias
npm install --production

# Copiar variables de entorno
cp .env.production .env
nano .env  # Editar con las claves correctas
```

**Opción 3.2: Usando SCP**

```bash
# En tu máquina local
cd D:\mediciones_IA

# Subir archivos (esto puede tardar)
scp -r . root@tu-servidor-ip:/var/www/mediciones-ia/

# Conectar al servidor y configurar
ssh root@tu-servidor-ip
cd /var/www/mediciones-ia
npm install --production
```

**Opción 3.3: Usando SFTP (más fácil)**

Usa FileZilla o WinSCP:
1. Conectar a `tu-servidor-ip` con usuario `root`
2. Subir toda la carpeta a `/var/www/mediciones-ia/`
3. Por SSH ejecutar: `cd /var/www/mediciones-ia && npm install --production`

### Paso 4: Configurar PM2

```bash
cd /var/www/mediciones-ia

# Usar el archivo de configuración PM2 incluido
pm2 start deployment/pm2.config.js

# Verificar que esté corriendo
pm2 list
pm2 logs

# Configurar para que inicie en boot
pm2 startup
pm2 save
```

### Paso 5: Configurar Nginx

```bash
# Copiar configuración de nginx
cp deployment/nginx.conf /etc/nginx/sites-available/mediciones-ia

# Editar con tu dominio
nano /etc/nginx/sites-available/mediciones-ia
# Cambiar "tu-dominio.com" por tu dominio real

# Activar el sitio
ln -s /etc/nginx/sites-available/mediciones-ia /etc/nginx/sites-enabled/

# Probar configuración
nginx -t

# Recargar nginx
systemctl reload nginx
```

### Paso 6: Configurar SSL (HTTPS)

```bash
# Obtener certificado SSL gratis
certbot --nginx -d tu-dominio.com -d www.tu-dominio.com

# Certbot configurará SSL automáticamente
# Renovación automática ya está configurada
```

### Paso 7: Configurar Firewall

```bash
# Permitir conexiones necesarias
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw enable
```

---

## ☁️ Deployment en Railway.app

### 1. Preparar el Proyecto

Crea `railway.json` en la raíz:
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node api/server.js",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### 2. Crear Procfile

Crea `Procfile` en la raíz:
```
web: node api/server.js
```

### 3. Deployment

1. Crear cuenta en railway.app
2. Conectar repositorio de GitHub
3. Agregar variables de entorno en el dashboard
4. Deploy automático!

---

## 🔧 Configuración Post-Deployment

### Crear Base de Datos Inicial

```bash
cd /var/www/mediciones-ia
mkdir -p data
touch data/analysis.db

# Dar permisos
chown -R www-data:www-data data/
chmod -R 755 data/
```

### Verificar que Todo Funciona

```bash
# Ver logs del servidor
pm2 logs mediciones-ia-api

# Ver status
pm2 status

# Reiniciar si es necesario
pm2 restart mediciones-ia-api
```

### Probar la Aplicación

1. Abrir navegador en: `https://tu-dominio.com`
2. Verificar que el frontend carga
3. Ir a Dashboard y verificar conexión con API
4. Probar crear un análisis de prueba

---

## 🔄 Mantenimiento

### Actualizar la Aplicación

```bash
# Conectar al servidor
ssh root@tu-servidor-ip
cd /var/www/mediciones-ia

# Si usas Git
git pull origin main
npm install --production
npm run build

# Reiniciar PM2
pm2 restart all

# Verificar
pm2 logs
```

### Backups de Base de Datos

```bash
# Backup manual
cp data/analysis.db data/analysis.db.backup-$(date +%Y%m%d)

# Script automático de backup (ver deployment/backup.sh)
chmod +x deployment/backup.sh
crontab -e
# Agregar: 0 2 * * * /var/www/mediciones-ia/deployment/backup.sh
```

### Monitoreo

```bash
# Ver uso de recursos
pm2 monit

# Ver logs en tiempo real
pm2 logs --lines 100

# Ver errores
pm2 logs --err
```

### Comandos Útiles PM2

```bash
pm2 list              # Listar procesos
pm2 restart all       # Reiniciar todos
pm2 stop all          # Detener todos
pm2 delete all        # Eliminar todos
pm2 logs              # Ver logs
pm2 monit             # Monitor en tiempo real
```

---

## 🆘 Troubleshooting

### El servidor no inicia

```bash
# Ver logs detallados
pm2 logs --err

# Verificar puerto
netstat -tulpn | grep 3003

# Verificar permisos
ls -la /var/www/mediciones-ia
```

### Error de base de datos

```bash
# Verificar permisos
ls -la data/
chown -R www-data:www-data data/
chmod -R 755 data/
```

### Nginx no funciona

```bash
# Ver logs de nginx
tail -f /var/log/nginx/error.log

# Probar configuración
nginx -t

# Reiniciar nginx
systemctl restart nginx
```

### SSL no funciona

```bash
# Renovar certificado
certbot renew --dry-run

# Forzar renovación
certbot renew --force-renewal
```

---

## 📞 Soporte

Para problemas o dudas:
- Revisar logs: `pm2 logs`
- Verificar variables de entorno en `.env`
- Contactar al desarrollador

---

## 📝 Checklist Final

- [ ] Servidor configurado con Node.js, Nginx, PM2
- [ ] Proyecto subido y dependencias instaladas
- [ ] Variables de entorno configuradas (`.env`)
- [ ] PM2 ejecutando la aplicación
- [ ] Nginx configurado y funcionando
- [ ] SSL/HTTPS configurado
- [ ] Firewall configurado
- [ ] Base de datos creada con permisos
- [ ] Aplicación accesible desde navegador
- [ ] Análisis de prueba funciona
- [ ] Backups configurados
- [ ] Documentación entregada al cliente

¡Tu aplicación está lista para producción! 🎉
