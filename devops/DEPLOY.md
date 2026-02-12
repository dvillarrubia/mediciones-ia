# Despliegue - Mediciones IA

## Entornos

| Entorno | URL aplicacion | Portainer | Tag Docker |
|---------|---------------|-----------|------------|
| **PRE** (preproduccion) | https://dev-mediciones-ia.lin3s.dev/login | https://dev-cortex_portainer.lin3s.dev/ | `latest` |
| **PROD** (produccion) | https://mediciones-ia.lin3s.dev/ | https://cortex_portainer.lin3s.dev/ | `prod` |

---

## Proceso completo: de codigo a produccion

### 1. Crear una release

Desde la raiz del proyecto, en tu maquina local:

```bash
npm run release
```

Se abre un menu interactivo:

```
¿Que tipo de release?
  1) patch   ← bugfixes (0.0.1 → 0.0.2)
  2) minor   ← nuevas funcionalidades (0.0.2 → 0.1.0)
  3) major   ← cambios incompatibles (0.1.0 → 1.0.0)
Selecciona (1/2/3):
```

Esto hace automaticamente:
- Actualiza la version en `package.json`
- Crea un commit: `release: mediciones-ia-vX.Y.Z`
- Crea un git tag: `mediciones-ia-vX.Y.Z`

### 2. Pushear el tag (despliega en PRE)

```bash
git push && git push --tags
```

Al pushear el tag, GitLab CI **arranca automaticamente** el job `build-images` que:

1. Construye la imagen Docker de **nginx** (frontend)
2. Construye la imagen Docker de **api** (backend)
3. Sube ambas imagenes al registry con tags `mediciones-ia-vX.Y.Z` y `latest`

> **Watchtower** en el servidor de PRE detecta las nuevas imagenes `latest` y actualiza los contenedores automaticamente (cada 5 minutos).

Puedes ver el progreso del pipeline en:
https://gitlab.lin3s.com/dvillarrubia/mediciones-ia/-/pipelines

### 3. Verificar en PRE

Accede a la aplicacion en PRE y comprueba que todo funciona:

https://dev-mediciones-ia.lin3s.dev/login

### 4. Promover a PROD (manual)

Una vez validado en PRE, ve al pipeline en GitLab:

1. Abre https://gitlab.lin3s.com/dvillarrubia/mediciones-ia/-/pipelines
2. Localiza el pipeline del tag que quieres promover
3. En el stage **deploy-prod**, haz clic en el boton **Play** (triangulo)

Esto re-etiqueta las imagenes ya construidas con el sufijo `-prod` y el tag `prod`:
- `nginx:mediciones-ia-vX.Y.Z` → `nginx:prod`
- `api:mediciones-ia-vX.Y.Z` → `api:prod`

> **Watchtower** en el servidor de PROD detecta las nuevas imagenes `prod` y actualiza los contenedores automaticamente.

---

## Diagrama del flujo

```
npm run release
    |
    v
git push && git push --tags
    |
    v
[GitLab CI - AUTOMATICO]
build-images:
    Construye nginx + api
    Push → :latest + :mediciones-ia-vX.Y.Z
    |
    v
PRE se actualiza (Watchtower detecta :latest)
    |
    v
Verificar en https://dev-mediciones-ia.lin3s.dev/
    |
    v
[GitLab CI - MANUAL]
deploy-prod:
    Click en "Play" en el pipeline
    Re-tag → :prod + :mediciones-ia-vX.Y.Z-prod
    |
    v
PROD se actualiza (Watchtower detecta :prod)
    |
    v
Verificar en https://mediciones-ia.lin3s.dev/
```

---

## Configurar variables de entorno

Las variables de entorno se configuran **en Portainer**, dentro de cada stack.

### En PROD

1. Ir al stack: https://cortex_portainer.lin3s.dev/#!/3/docker/stacks/mediciones-ia-default?id=6&type=2&regular=true&orphaned=false&orphanedRunning=false
2. Pulsar **Editor** (o "Edit")
3. Bajar hasta la seccion **Environment variables**
4. Configurar las variables necesarias
5. Pulsar **Update the stack**

### Variables requeridas

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `OPENAI_API_KEY` | **Si** | Clave API de OpenAI (obligatoria para el analisis con IA) |
| `JWT_SECRET` | **Si** | Secreto para firmar tokens JWT. Usar un valor largo y aleatorio |
| `ANTHROPIC_API_KEY` | No | Clave API de Anthropic Claude (opcional) |
| `GOOGLE_AI_API_KEY` | No | Clave API de Google Gemini (opcional) |

> **Importante:** Despues de cambiar variables, hay que hacer **Update the stack** para que los contenedores se recreen con los nuevos valores.

---

## Troubleshooting

### Ver logs de los contenedores

Desde Portainer, entra en el contenedor y consulta los logs. O por SSH en el servidor:

```bash
docker logs medicionesia_default_api
docker logs medicionesia_default_nginx
```

### Forzar actualizacion manual

Si Watchtower no ha recogido la nueva imagen:

```bash
cd /home/lin3s/mediciones_ia/default
docker compose pull
docker compose up -d
```

### La API no arranca

Normalmente es porque falta `OPENAI_API_KEY`. Comprobar las variables de entorno en Portainer.

### Nginx no pasa el health check

1. Comprobar que la API esta healthy primero (`docker ps`)
2. Nginx depende de la API: si la API no arranca, nginx tampoco

### Ver el estado de las imagenes en el registry

https://gitlab.lin3s.com/dvillarrubia/mediciones-ia/container_registry

---

## Datos persistentes

Los datos de la aplicacion se almacenan en el servidor, fuera de los contenedores:

| Ruta en el servidor | Ruta en el contenedor | Contenido |
|---------------------|-----------------------|-----------|
| `/home/lin3s/mediciones_ia/default/data/` | `/app/data/` | Base de datos SQLite, analisis, configuraciones, proyectos |
| `/home/lin3s/mediciones_ia/default/logs/` | `/app/logs/` | Logs de la aplicacion |

> Estos directorios **no se borran** al actualizar o recrear los contenedores.
