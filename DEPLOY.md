# Guía de Deploy - Mediciones IA

## Deploy Automático (Recomendado)

El proyecto está configurado con GitHub Actions. **Solo haz push a main** y el deploy se ejecuta automáticamente:

```bash
git add .
git commit -m "descripción del cambio"
git push origin main
```

Ver estado del deploy: https://github.com/dvillarrubia/mediciones-ia/actions

---

## Deploy Manual (si es necesario)

### Desde el VPS (SSH o Panel Hostinger)

```bash
cd /opt/mediciones-ia && git pull origin main && docker compose -f docker-compose.prod.yml up -d --build
```

### Verificar que funciona

```bash
docker ps | grep mediciones
docker logs mediciones-ia-app --tail 20
curl -I https://mediciones.srv817047.hstgr.cloud
```

---

## Configuración del Servidor

| Elemento | Valor |
|----------|-------|
| VPS | Hostinger |
| Ruta proyecto | `/opt/mediciones-ia` |
| Dominio | `mediciones.srv817047.hstgr.cloud` |
| Puerto interno | 3003 |
| Reverse Proxy | Traefik |
| Red Traefik | `root_default` |
| Cert Resolver | `mytlschallenge` |
| Contenedor | `mediciones-ia-app` |

---

## Solución de Problemas

### Error 404 o no carga
```bash
# Verificar que el contenedor esté en la red de Traefik
docker network connect root_default mediciones-ia-app
```

### Error de certificado SSL
El cert resolver debe ser `mytlschallenge` (ya configurado en docker-compose.prod.yml)

### Ver logs de Traefik
```bash
docker logs root-traefik-1 --tail 30 | grep mediciones
```

### Reconstruir desde cero
```bash
cd /opt/mediciones-ia
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build --force-recreate
```

### Error 504 Gateway Timeout
Si da 504 después de recrear el contenedor, verificar que Traefik detecta la red correcta:
```bash
# Ver qué IP está usando Traefik
docker exec root-traefik-1 wget -q -O - 'http://localhost:8080/api/http/services/mediciones@docker'

# La IP debe coincidir con la del contenedor en root_default
docker network inspect root_default | grep -A 5 mediciones
```
El docker-compose.prod.yml ya incluye `traefik.docker.network=root_default` para evitar este problema.

---

## GitHub Actions Secrets (ya configurados)

- `VPS_HOST`: srv817047.hstgr.cloud
- `VPS_USER`: root
- `VPS_SSH_KEY`: Clave en ~/.ssh/github_deploy
