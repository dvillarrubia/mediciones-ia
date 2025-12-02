# Despliegue con Docker

## Requisitos Previos

- Docker 20.10+
- Docker Compose v2+
- (Opcional) Traefik si usas el modo producción con SSL automático

## Inicio Rápido

### 1. Configurar variables de entorno

```bash
# Copiar archivo de ejemplo
cp .env.docker .env

# Editar con tus API keys
nano .env
```

Variables requeridas:
- `OPENAI_API_KEY`: Tu API key de OpenAI

Variables opcionales:
- `ANTHROPIC_API_KEY`: API key de Anthropic/Claude
- `GOOGLE_AI_API_KEY`: API key de Google AI
- `JWT_SECRET`: Secreto para tokens JWT (cambiar en producción)
- `VITE_API_BASE_URL`: URL de la API (dejar vacío si es mismo servidor)
- `DOMAIN`: Tu dominio (solo para modo producción con Traefik)

### 2. Desplegar

```bash
# Opción A: Despliegue simple (puerto 3003)
docker compose up -d

# Opción B: Despliegue con Nginx (puertos 80/443)
docker compose --profile with-nginx up -d

# Opción C: Producción con Traefik (SSL automático)
docker compose -f docker-compose.prod.yml up -d
```

### 3. Verificar

```bash
# Ver logs
docker compose logs -f

# Verificar estado
curl http://localhost:3003/api/health
```

## Comandos Útiles

```bash
# Detener servicios
docker compose down

# Reiniciar
docker compose restart

# Reconstruir imagen
docker compose build --no-cache

# Ver logs en tiempo real
docker compose logs -f app

# Acceder al contenedor
docker exec -it mediciones-ia-app sh

# Backup de base de datos
./docker/backup-data.sh
```

## Estructura de Archivos

```
.
├── Dockerfile              # Imagen Docker multi-stage
├── docker-compose.yml      # Compose para desarrollo/simple
├── docker-compose.prod.yml # Compose para producción con Traefik
├── .dockerignore           # Archivos excluidos del build
├── .env.docker             # Ejemplo de variables de entorno
└── docker/
    ├── nginx/
    │   └── nginx.conf      # Configuración Nginx
    ├── deploy.sh           # Script de despliegue automatizado
    ├── backup-data.sh      # Script de backup
    └── README.md           # Esta documentación
```

## Volúmenes

| Volumen | Descripción |
|---------|-------------|
| `sqlite_data` | Base de datos SQLite persistente |
| `./logs` | Logs de la aplicación |

## Puertos

| Puerto | Servicio |
|--------|----------|
| 3003 | Aplicación (API + Frontend) |
| 80 | Nginx HTTP (si se activa) |
| 443 | Nginx HTTPS (si se activa) |

## Modo Producción con Traefik

Si ya tienes Traefik instalado en tu VPS:

1. Asegúrate de que existe la red `traefik-public`:
   ```bash
   docker network create traefik-public
   ```

2. Configura tu dominio en `.env`:
   ```
   DOMAIN=mediciones.tudominio.com
   ```

3. Despliega:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

Traefik se encargará automáticamente del SSL con Let's Encrypt.

## Solución de Problemas

### El contenedor no inicia
```bash
docker compose logs app
```

### Error de permisos en SQLite
```bash
docker exec -it mediciones-ia-app chmod 755 /app/data
```

### Reconstruir desde cero
```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

### Ver uso de recursos
```bash
docker stats mediciones-ia-app
```

## Backup y Restauración

### Crear backup
```bash
./docker/backup-data.sh
```

### Restaurar backup
```bash
# Detener contenedor
docker compose down

# Copiar backup al volumen
docker run --rm -v mediciones_ia_sqlite_data:/data -v $(pwd)/backups:/backup alpine \
  cp /backup/analysis_YYYYMMDD_HHMMSS.db /data/analysis.db

# Reiniciar
docker compose up -d
```

## Actualización

```bash
# Hacer backup primero
./docker/backup-data.sh

# Obtener últimos cambios
git pull

# Reconstruir y desplegar
docker compose build --no-cache
docker compose up -d
```
