# GUIA COMPLETA DE INSTALACION - MEDICIONES IA

## Tabla de Contenidos

1. [Introduccion](#1-introduccion)
2. [Requisitos Previos](#2-requisitos-previos)
3. [Instalacion con Docker (Recomendado)](#3-instalacion-con-docker-recomendado)
   - 3.1 [Instalacion Local con Docker](#31-instalacion-local-con-docker)
   - 3.2 [Instalacion en VPS con Docker](#32-instalacion-en-vps-con-docker)
4. [Instalacion Manual en VPS (Sin Docker)](#4-instalacion-manual-en-vps-sin-docker)
5. [Configuracion de Variables de Entorno](#5-configuracion-de-variables-de-entorno)
6. [Configuracion de SSL/HTTPS](#6-configuracion-de-sslhttps)
7. [Verificacion de la Instalacion](#7-verificacion-de-la-instalacion)
8. [Comandos Utiles](#8-comandos-utiles)
9. [Solucion de Problemas](#9-solucion-de-problemas)
10. [Mantenimiento y Backups](#10-mantenimiento-y-backups)

---

## 1. Introduccion

**Mediciones IA** es una plataforma de analisis de marca que utiliza inteligencia artificial (OpenAI, Anthropic Claude, Google Gemini) para realizar analisis competitivos y de sentimiento.

### Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    MEDICIONES IA                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐ │
│  │   Frontend   │────▶│   Backend    │────▶│   SQLite     │ │
│  │   (React)    │     │  (Express)   │     │  (Database)  │ │
│  │   Puerto     │     │   Puerto     │     │              │ │
│  │   5173 (dev) │     │   3003       │     │  /app/data/  │ │
│  └──────────────┘     └──────────────┘     └──────────────┘ │
│                              │                               │
│                              ▼                               │
│                    ┌──────────────────┐                     │
│                    │   APIs de IA     │                     │
│                    │  - OpenAI        │                     │
│                    │  - Anthropic     │                     │
│                    │  - Google AI     │                     │
│                    └──────────────────┘                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Tecnologias Utilizadas

| Componente | Tecnologia |
|-----------|------------|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Backend | Node.js 20 + Express + TypeScript |
| Base de Datos | SQLite3 |
| Contenedores | Docker + Docker Compose |
| Proxy Reverso | Nginx o Traefik |
| Gestor de Procesos | PM2 |

---

## 2. Requisitos Previos

### 2.1 Requisitos de Hardware

| Recurso | Minimo | Recomendado |
|---------|--------|-------------|
| RAM | 2 GB | 4 GB |
| CPU | 1 core | 2 cores |
| Disco | 20 GB | 50 GB |
| Red | 100 Mbps | 1 Gbps |

### 2.2 Requisitos de Software

**Para instalacion con Docker:**
- Docker 20.10 o superior
- Docker Compose v2.0 o superior
- Git

**Para instalacion manual:**
- Ubuntu 20.04+ / Debian 11+ / Windows 10+
- Node.js 20+
- npm 9+
- Git
- Nginx (para produccion)

### 2.3 API Keys Necesarias

| API Key | Obligatoria | Descripcion |
|---------|------------|-------------|
| OpenAI API Key | SI | Para analisis estandar con ChatGPT |
| Anthropic API Key | NO | Para analisis multi-modelo con Claude |
| Google AI API Key | NO | Para analisis multi-modelo con Gemini |

**Como obtener las API Keys:**

1. **OpenAI**: https://platform.openai.com/api-keys
2. **Anthropic**: https://console.anthropic.com/
3. **Google AI**: https://makersuite.google.com/app/apikey

---

## 3. Instalacion con Docker (Recomendado)

Docker es el metodo recomendado porque:
- Configuracion consistente
- Facil de mantener y actualizar
- Aislamiento del sistema
- Incluye todas las dependencias

### 3.1 Instalacion Local con Docker

#### Paso 1: Instalar Docker

**En Windows:**
1. Descargar Docker Desktop: https://www.docker.com/products/docker-desktop
2. Ejecutar el instalador
3. Reiniciar el sistema
4. Verificar instalacion:
```bash
docker --version
docker compose version
```

**En macOS:**
1. Descargar Docker Desktop: https://www.docker.com/products/docker-desktop
2. Arrastrar a Aplicaciones
3. Ejecutar Docker Desktop
4. Verificar instalacion:
```bash
docker --version
docker compose version
```

**En Linux (Ubuntu/Debian):**
```bash
# Actualizar sistema
sudo apt update
sudo apt upgrade -y

# Instalar dependencias
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Agregar repositorio oficial de Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Agregar usuario al grupo docker (para no usar sudo)
sudo usermod -aG docker $USER
newgrp docker

# Verificar instalacion
docker --version
docker compose version
```

#### Paso 2: Clonar o Copiar el Proyecto

```bash
# Opcion A: Si tienes el proyecto en un repositorio Git
git clone <URL_DEL_REPOSITORIO> mediciones-ia
cd mediciones-ia

# Opcion B: Si tienes los archivos localmente
cd /ruta/a/mediciones_IA
```

#### Paso 3: Configurar Variables de Entorno

```bash
# Copiar el archivo de ejemplo
cp .env.docker .env

# Editar el archivo .env
# En Windows: notepad .env
# En Linux/Mac: nano .env
```

Contenido del archivo `.env`:
```env
# Puerto de la aplicacion (no cambiar a menos que sea necesario)
PORT=3003

# API Key de OpenAI (OBLIGATORIO)
# Obtenla en: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-tu-api-key-de-openai-aqui

# API Keys opcionales (para analisis multi-modelo)
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=

# Secreto para JWT (cambiar en produccion)
JWT_SECRET=mi-secreto-super-seguro-cambiar-en-produccion

# URL de la API (dejar vacio para mismo servidor)
VITE_API_BASE_URL=

# Dominio (solo si usas Traefik en produccion)
DOMAIN=mediciones.tudominio.com
```

#### Paso 4: Construir y Ejecutar

```bash
# Construir la imagen de Docker
docker compose build

# Iniciar la aplicacion
docker compose up -d

# Verificar que esta funcionando
docker compose ps
docker compose logs -f app
```

#### Paso 5: Acceder a la Aplicacion

Abre tu navegador y ve a: **http://localhost:3003**

---

### 3.2 Instalacion en VPS con Docker

#### Paso 1: Contratar un VPS

Proveedores recomendados:
- **DigitalOcean**: https://www.digitalocean.com (desde $4/mes)
- **Hetzner**: https://www.hetzner.com (desde 3.79 EUR/mes)
- **Vultr**: https://www.vultr.com (desde $5/mes)
- **Linode**: https://www.linode.com (desde $5/mes)
- **AWS Lightsail**: https://aws.amazon.com/lightsail (desde $3.50/mes)

**Especificaciones minimas:**
- Sistema: Ubuntu 22.04 LTS
- RAM: 2 GB
- CPU: 1 vCPU
- Disco: 25 GB SSD
- Ubicacion: Cerca de tus usuarios

#### Paso 2: Conectarse al VPS

```bash
# Desde tu terminal local
ssh root@IP_DE_TU_VPS

# Ejemplo:
ssh root@123.456.789.0
```

#### Paso 3: Instalar Docker en el VPS

```bash
# Actualizar sistema
apt update && apt upgrade -y

# Instalar dependencias
apt install -y apt-transport-https ca-certificates curl gnupg lsb-release git

# Instalar Docker
curl -fsSL https://get.docker.com | sh

# Habilitar Docker para iniciar automaticamente
systemctl enable docker
systemctl start docker

# Verificar instalacion
docker --version
docker compose version
```

#### Paso 4: Configurar Firewall

```bash
# Instalar UFW si no esta instalado
apt install -y ufw

# Configurar reglas
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3003/tcp  # Solo si quieres acceso directo sin nginx

# Habilitar firewall
ufw --force enable

# Verificar estado
ufw status
```

#### Paso 5: Subir el Proyecto al VPS

**Opcion A: Usando Git (recomendado)**
```bash
# En el VPS
cd /opt
git clone <URL_DEL_REPOSITORIO> mediciones-ia
cd mediciones-ia
```

**Opcion B: Usando SCP desde tu maquina local**
```bash
# Desde tu maquina LOCAL (no en el VPS)
# Primero comprimir el proyecto
cd /ruta/al/proyecto
tar -czvf mediciones-ia.tar.gz --exclude='node_modules' --exclude='.git' .

# Subir al VPS
scp mediciones-ia.tar.gz root@IP_DE_TU_VPS:/opt/

# Conectarse al VPS y descomprimir
ssh root@IP_DE_TU_VPS
cd /opt
mkdir mediciones-ia
tar -xzvf mediciones-ia.tar.gz -C mediciones-ia
cd mediciones-ia
```

**Opcion C: Usando SFTP (FileZilla, WinSCP, etc.)**
1. Conectar con SFTP a tu VPS
2. Navegar a /opt/
3. Crear carpeta mediciones-ia
4. Subir todos los archivos del proyecto

#### Paso 6: Configurar Variables de Entorno

```bash
cd /opt/mediciones-ia

# Copiar archivo de ejemplo
cp .env.docker .env

# Editar con nano
nano .env
```

Configuracion recomendada para VPS:
```env
PORT=3003
OPENAI_API_KEY=sk-tu-api-key-real
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=
JWT_SECRET=genera-una-clave-aleatoria-muy-larga-y-segura
VITE_API_BASE_URL=
DOMAIN=tudominio.com
```

**Tip**: Para generar un JWT_SECRET seguro:
```bash
openssl rand -base64 32
```

#### Paso 7: Construir y Ejecutar

```bash
cd /opt/mediciones-ia

# Construir imagen
docker compose build

# Iniciar en modo detached (segundo plano)
docker compose up -d

# Verificar que esta corriendo
docker compose ps

# Ver logs
docker compose logs -f app
```

#### Paso 8: Configurar Nginx como Proxy Reverso

```bash
# Instalar Nginx
apt install -y nginx

# Crear configuracion para el sitio
nano /etc/nginx/sites-available/mediciones-ia
```

Contenido del archivo:
```nginx
server {
    listen 80;
    server_name tudominio.com www.tudominio.com;
    # O si no tienes dominio: server_name _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Max upload size
    client_max_body_size 10M;

    # Proxy a la aplicacion Docker
    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

```bash
# Habilitar el sitio
ln -s /etc/nginx/sites-available/mediciones-ia /etc/nginx/sites-enabled/

# Eliminar sitio por defecto
rm /etc/nginx/sites-enabled/default

# Probar configuracion
nginx -t

# Si dice "syntax is ok", reiniciar nginx
systemctl restart nginx
systemctl enable nginx
```

#### Paso 9: Configurar Dominio (Opcional pero Recomendado)

1. **Comprar un dominio** en:
   - Namecheap: https://www.namecheap.com
   - GoDaddy: https://www.godaddy.com
   - Google Domains: https://domains.google

2. **Configurar DNS**:
   - Agregar registro A: `@` -> `IP_DE_TU_VPS`
   - Agregar registro A: `www` -> `IP_DE_TU_VPS`

3. **Esperar propagacion** (puede tomar hasta 48 horas, usualmente 15-30 minutos)

4. **Verificar propagacion**:
```bash
dig tudominio.com +short
# Debe mostrar la IP de tu VPS
```

#### Paso 10: Configurar SSL/HTTPS con Certbot

```bash
# Instalar Certbot
apt install -y certbot python3-certbot-nginx

# Obtener certificado SSL
certbot --nginx -d tudominio.com -d www.tudominio.com

# Seguir las instrucciones:
# - Ingresar email
# - Aceptar terminos
# - Elegir redirigir HTTP a HTTPS (opcion 2)

# Verificar renovacion automatica
certbot renew --dry-run
```

#### Paso 11: Verificar Instalacion

```bash
# Verificar contenedores
docker compose ps

# Verificar logs
docker compose logs --tail=50 app

# Verificar salud de la API
curl http://localhost:3003/api/health

# Verificar desde internet (reemplazar con tu dominio/IP)
curl https://tudominio.com/api/health
```

---

## 4. Instalacion Manual en VPS (Sin Docker)

Si prefieres no usar Docker, puedes instalar directamente en el servidor.

### Paso 1: Preparar el Servidor

```bash
# Conectarse al VPS
ssh root@IP_DE_TU_VPS

# Actualizar sistema
apt update && apt upgrade -y

# Instalar dependencias basicas
apt install -y curl git build-essential software-properties-common
```

### Paso 2: Instalar Node.js 20

```bash
# Agregar repositorio de NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -

# Instalar Node.js
apt install -y nodejs

# Verificar instalacion
node --version  # Debe mostrar v20.x.x
npm --version   # Debe mostrar 10.x.x
```

### Paso 3: Instalar PM2

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Verificar instalacion
pm2 --version
```

### Paso 4: Instalar Nginx

```bash
# Instalar Nginx
apt install -y nginx

# Habilitar e iniciar
systemctl enable nginx
systemctl start nginx

# Verificar estado
systemctl status nginx
```

### Paso 5: Subir y Configurar la Aplicacion

```bash
# Crear directorio
mkdir -p /var/www/mediciones-ia
cd /var/www/mediciones-ia

# Subir archivos (usando uno de los metodos del Paso 5 de la seccion Docker)
# Opcion: git clone, scp, sftp, etc.

# Instalar dependencias de produccion
npm ci --omit=dev

# Instalar tsx para ejecutar TypeScript
npm install tsx

# Crear archivo .env
nano .env
```

Contenido de `.env`:
```env
NODE_ENV=production
PORT=3003
OPENAI_API_KEY=sk-tu-api-key
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=
JWT_SECRET=tu-secreto-super-seguro
```

### Paso 6: Compilar Frontend

```bash
# Instalar TODAS las dependencias (temporalmente)
npm ci

# Compilar frontend
npm run build

# Verificar que se creo la carpeta dist
ls -la dist/

# Limpiar dependencias de desarrollo
rm -rf node_modules
npm ci --omit=dev
npm install tsx
```

### Paso 7: Configurar PM2

Crear archivo de configuracion PM2:
```bash
nano pm2.config.js
```

Contenido:
```javascript
module.exports = {
  apps: [{
    name: 'mediciones-ia',
    script: 'npx',
    args: 'tsx api/server.ts',
    cwd: '/var/www/mediciones-ia',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3003
    },
    max_memory_restart: '500M',
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

Iniciar la aplicacion:
```bash
# Iniciar con PM2
pm2 start pm2.config.js

# Guardar configuracion para reinicio automatico
pm2 save
pm2 startup

# Verificar estado
pm2 status
pm2 logs mediciones-ia
```

### Paso 8: Configurar Nginx

```bash
# Crear configuracion
nano /etc/nginx/sites-available/mediciones-ia
```

Usar la misma configuracion de Nginx del Paso 8 de la seccion Docker.

```bash
# Habilitar sitio
ln -s /etc/nginx/sites-available/mediciones-ia /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
```

### Paso 9: Configurar SSL (mismo proceso que en Docker)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d tudominio.com -d www.tudominio.com
```

---

## 5. Configuracion de Variables de Entorno

### Variables Disponibles

| Variable | Obligatoria | Descripcion | Valor por Defecto |
|----------|-------------|-------------|-------------------|
| `PORT` | No | Puerto del servidor | 3003 |
| `NODE_ENV` | No | Entorno de ejecucion | production |
| `OPENAI_API_KEY` | SI | API Key de OpenAI | - |
| `ANTHROPIC_API_KEY` | No | API Key de Anthropic | - |
| `GOOGLE_AI_API_KEY` | No | API Key de Google AI | - |
| `JWT_SECRET` | SI (prod) | Secreto para tokens JWT | - |
| `VITE_API_BASE_URL` | No | URL base de la API | (mismo servidor) |
| `DOMAIN` | No | Dominio para Traefik | - |

### Ejemplo de Archivo .env Completo

```env
# ===========================================
# CONFIGURACION MEDICIONES IA - PRODUCCION
# ===========================================

# Puerto de la aplicacion
PORT=3003

# Entorno
NODE_ENV=production

# API Keys (OBLIGATORIO: al menos OpenAI)
# Obten tu API key en: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# API Keys Opcionales (para analisis multi-modelo)
# Obten tu API key en: https://console.anthropic.com/
ANTHROPIC_API_KEY=

# Obten tu API key en: https://makersuite.google.com/app/apikey
GOOGLE_AI_API_KEY=

# Secreto para JWT (CAMBIAR EN PRODUCCION)
# Genera uno con: openssl rand -base64 32
JWT_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# URL de la API para el frontend
# Dejar vacio si el frontend y backend estan en el mismo servidor
# Ejemplos:
#   - Si usas dominio: https://midominio.com
#   - Si usas IP: http://123.456.789.0:3003
VITE_API_BASE_URL=

# Dominio (solo si usas docker-compose.prod.yml con Traefik)
DOMAIN=mediciones.midominio.com
```

### Seguridad de Variables de Entorno

1. **NUNCA** subas el archivo `.env` a Git
2. **SIEMPRE** usa secretos fuertes en produccion
3. Restringe permisos del archivo:
```bash
chmod 600 .env
```

---

## 6. Configuracion de SSL/HTTPS

### Opcion A: Certbot (Let's Encrypt) - GRATIS

```bash
# Instalar Certbot
apt install -y certbot python3-certbot-nginx

# Obtener certificado (nginx debe estar corriendo)
certbot --nginx -d tudominio.com -d www.tudominio.com

# El certificado se renueva automaticamente
# Verificar renovacion automatica
certbot renew --dry-run
```

### Opcion B: Traefik con Docker (automatico)

Si usas `docker-compose.prod.yml`, Traefik maneja SSL automaticamente.

```bash
# Primero, crear la red de Traefik
docker network create traefik-public

# Crear archivo de configuracion de Traefik
mkdir -p /opt/traefik
nano /opt/traefik/docker-compose.yml
```

Contenido de Traefik:
```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    container_name: traefik
    restart: always
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=tu@email.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "./letsencrypt:/letsencrypt"
    networks:
      - traefik-public

networks:
  traefik-public:
    external: true
```

```bash
# Iniciar Traefik
cd /opt/traefik
docker compose up -d

# Luego, iniciar Mediciones IA con el archivo de produccion
cd /opt/mediciones-ia
docker compose -f docker-compose.prod.yml up -d
```

---

## 7. Verificacion de la Instalacion

### Verificar que la Aplicacion esta Funcionando

```bash
# Verificar contenedor Docker
docker compose ps
# Debe mostrar el contenedor "mediciones-ia-app" con STATUS "Up"

# Verificar logs
docker compose logs --tail=100 app
# No debe haber errores criticos

# Verificar API health
curl http://localhost:3003/api/health
# Debe retornar: {"success":true,"timestamp":"...","environment":"production"}

# Verificar desde internet (reemplaza con tu dominio/IP)
curl https://tudominio.com/api/health
```

### Verificar PM2 (si instalacion manual)

```bash
pm2 status
# Debe mostrar "mediciones-ia" con status "online"

pm2 logs mediciones-ia --lines 100
# Revisar que no hay errores
```

### Verificar Nginx

```bash
# Estado de Nginx
systemctl status nginx

# Probar configuracion
nginx -t
# Debe decir "syntax is ok" y "test is successful"
```

### Verificar SSL

```bash
# Probar certificado SSL
curl -I https://tudominio.com
# Debe retornar HTTP/2 200

# Verificar certificado detallado
openssl s_client -connect tudominio.com:443 -servername tudominio.com
```

---

## 8. Comandos Utiles

### Docker

```bash
# Ver contenedores corriendo
docker compose ps

# Ver logs en tiempo real
docker compose logs -f app

# Reiniciar aplicacion
docker compose restart app

# Detener todo
docker compose down

# Detener y eliminar volumenes (CUIDADO: borra datos)
docker compose down -v

# Reconstruir imagen
docker compose build --no-cache

# Actualizar y reiniciar
docker compose pull
docker compose up -d --build
```

### PM2

```bash
# Ver estado
pm2 status

# Ver logs
pm2 logs mediciones-ia

# Reiniciar
pm2 restart mediciones-ia

# Detener
pm2 stop mediciones-ia

# Eliminar proceso
pm2 delete mediciones-ia

# Monitoreo en tiempo real
pm2 monit
```

### Nginx

```bash
# Estado
systemctl status nginx

# Reiniciar
systemctl restart nginx

# Recargar configuracion sin reiniciar
systemctl reload nginx

# Ver logs de error
tail -f /var/log/nginx/error.log

# Ver logs de acceso
tail -f /var/log/nginx/access.log
```

### Base de Datos SQLite

```bash
# Con Docker
docker compose exec app sqlite3 /app/data/analysis.db

# Sin Docker
sqlite3 /var/www/mediciones-ia/data/analysis.db

# Comandos SQLite utiles:
.tables          # Ver tablas
.schema          # Ver esquema
SELECT * FROM projects;
SELECT * FROM analysis LIMIT 10;
.quit            # Salir
```

---

## 9. Solucion de Problemas

### Problema: La aplicacion no inicia

**Verificar logs:**
```bash
docker compose logs app
# o
pm2 logs mediciones-ia
```

**Causas comunes:**
1. API Key de OpenAI incorrecta o vacia
2. Puerto 3003 ya en uso
3. Permisos incorrectos

**Soluciones:**
```bash
# Verificar API Key
cat .env | grep OPENAI

# Verificar puerto
lsof -i :3003
# Si hay algo, matarlo:
kill -9 <PID>

# Verificar permisos
chown -R 1000:1000 /opt/mediciones-ia/data
```

### Problema: Error 502 Bad Gateway

**Causa:** Nginx no puede conectar con la aplicacion

**Solucion:**
```bash
# Verificar que la app esta corriendo
docker compose ps
# o
pm2 status

# Verificar que el puerto es correcto en nginx
grep proxy_pass /etc/nginx/sites-available/mediciones-ia
# Debe decir: proxy_pass http://127.0.0.1:3003;

# Reiniciar todo
docker compose restart
systemctl restart nginx
```

### Problema: Error de CORS

**Causa:** El frontend intenta conectar a una URL incorrecta

**Solucion:**
```bash
# Verificar VITE_API_BASE_URL
cat .env | grep VITE_API_BASE_URL

# Si usas el mismo servidor, debe estar vacio:
VITE_API_BASE_URL=

# Si usas diferente servidor/dominio:
VITE_API_BASE_URL=https://api.tudominio.com

# Reconstruir despues de cambiar:
docker compose up -d --build
```

### Problema: Base de datos no persiste

**Con Docker:**
```bash
# Verificar volumen
docker volume ls | grep sqlite

# Inspeccionar volumen
docker volume inspect mediciones-ia_sqlite_data

# Si no existe, crear manualmente:
docker volume create mediciones-ia_sqlite_data
```

**Sin Docker:**
```bash
# Verificar directorio de datos
ls -la /var/www/mediciones-ia/data/

# Crear si no existe
mkdir -p /var/www/mediciones-ia/data
chown -R 1000:1000 /var/www/mediciones-ia/data
```

### Problema: SSL no funciona

```bash
# Verificar certificado
certbot certificates

# Renovar manualmente
certbot renew

# Si hay errores, recrear:
certbot delete --cert-name tudominio.com
certbot --nginx -d tudominio.com
```

### Problema: Memoria insuficiente

```bash
# Ver uso de memoria
free -h
docker stats

# Si esta lleno, agregar swap:
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Hacer permanente
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## 10. Mantenimiento y Backups

### Backup Automatico de Base de Datos

Crear script de backup:
```bash
nano /opt/backup-mediciones.sh
```

Contenido:
```bash
#!/bin/bash

# Configuracion
BACKUP_DIR="/var/backups/mediciones-ia"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Crear directorio si no existe
mkdir -p $BACKUP_DIR

# Backup con Docker
docker compose -f /opt/mediciones-ia/docker-compose.yml exec -T app \
  sqlite3 /app/data/analysis.db ".backup '/app/data/backup_$DATE.db'"

# Copiar al host
docker cp mediciones-ia-app:/app/data/backup_$DATE.db $BACKUP_DIR/

# Comprimir
gzip $BACKUP_DIR/backup_$DATE.db

# Eliminar backups antiguos
find $BACKUP_DIR -name "backup_*.db.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completado: $BACKUP_DIR/backup_$DATE.db.gz"
```

```bash
# Hacer ejecutable
chmod +x /opt/backup-mediciones.sh

# Probar
/opt/backup-mediciones.sh

# Agregar a crontab (backup diario a las 3am)
crontab -e
# Agregar linea:
0 3 * * * /opt/backup-mediciones.sh >> /var/log/backup-mediciones.log 2>&1
```

### Restaurar Backup

```bash
# Descomprimir
gunzip backup_20240115_030000.db.gz

# Restaurar con Docker
docker cp backup_20240115_030000.db mediciones-ia-app:/app/data/analysis.db

# Reiniciar aplicacion
docker compose restart app
```

### Actualizaciones

```bash
# Backup antes de actualizar
/opt/backup-mediciones.sh

# Obtener ultimas versiones
cd /opt/mediciones-ia
git pull  # Si usas git

# Reconstruir y reiniciar
docker compose down
docker compose build --no-cache
docker compose up -d

# Verificar
docker compose logs -f app
```

### Monitoreo

```bash
# Instalar htop para monitoreo
apt install -y htop

# Ver recursos en tiempo real
htop

# Ver logs del sistema
journalctl -f

# Ver uso de disco
df -h

# Ver uso de memoria
free -h
```

---

## Resumen Rapido

### Instalacion Docker en VPS (5 comandos)

```bash
# 1. Instalar Docker
curl -fsSL https://get.docker.com | sh

# 2. Clonar/subir proyecto
cd /opt && git clone <REPO> mediciones-ia && cd mediciones-ia

# 3. Configurar variables
cp .env.docker .env && nano .env

# 4. Iniciar
docker compose up -d

# 5. Verificar
curl http://localhost:3003/api/health
```

### URLs Importantes

- **Aplicacion**: http://localhost:3003 o https://tudominio.com
- **API Health**: http://localhost:3003/api/health
- **Dashboard**: http://localhost:3003/dashboard

---

**Documento creado para Mediciones IA**
**Version: 1.0**
**Fecha: Diciembre 2024**
