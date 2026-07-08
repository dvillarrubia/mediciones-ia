# Estado Actual y Pendientes — Mediciones IA

> Fecha: 8 de julio de 2026 · Rama: `main` (HEAD en `0d3ae6f`) · Versión en `package.json`: 0.0.8

Este documento resume **qué se ha implementado recientemente** (últimos ~20 commits) y **qué queda pendiente**, cruzando el estado real del código con los planes que ya existían en el repo (`Features de visualizacion/PLAN_*.md`). No sustituye a esos planes ni al `README.md`; los complementa señalando qué se movió de "plan" a "hecho" y qué sigue abierto.

---

## 1. Cambios recientes

### 1.1 Intelligence Hub — dashboards de inteligencia de marca
Módulo nuevo desde cero (commits `757c8bb`, `677f0d6`, `0d3ae6f`):

- **Dashboards**: Sentimiento, Topics, URLs/Citas, GAPS (vista temporal + vista por competencia) y Métricas, todos dentro de `IntelligenceHub.tsx`.
- **Glosario de marcas**: alias por marca + dominio propio (`brandDomain`) editable en Configuración (`BrandGlossaryEditor.tsx`), usado para unificar menciones (BIESS/biess/Instituto… cuentan como una sola marca).
- **Capa GEO accionable**:
  - Visibilidad por modelo (ChatGPT/Claude/Gemini/Perplexity) en Métricas.
  - Drivers de sentimiento (razonamiento del LLM) en Sentimiento.
  - Gap de citaciones por dominio en Citas.
- **GAPS**: matriz prompt × fecha con severidad (cuántos modelos/fechas falta la marca) y vista por competencia (prompts donde la marca no es nº1).
- **Usabilidad (commit `0d3ae6f`, el más reciente)**: filtro de marca + paginación en Sentimiento; selector de rango de fechas en los 5 dashboards para comparar "antes vs ahora"; botón "Exportar Excel" en los 5 dashboards, respetando los filtros aplicados. Utilidades compartidas nuevas: `dashboardFilters.tsx` y `dashboardExcelExport.ts`.

### 1.2 Fiabilidad del motor de análisis
- `e5e8e16` — orden de aparición determinista de marcas, fail-fast en errores 4xx (ya no se reintentan 404/400/401/403/422) y modelo usado visible en el resultado.
- `d0a01da` (el fix más reciente) — el timeout de generación (90s OpenAI / 120s OpenRouter) ahora mide solo la llamada real, no el tiempo en la cola global. Antes, con varias monitorizaciones programadas coincidiendo, las preguntas al fondo de la cola caducaban sin llegar a pedirse a la API (30 timeouts / 58 OK observado en prod). También se sube `OPENAI_QUEUE_MAX_CONCURRENT` a 8.
- `08cecc6` — cola global por proveedor (OpenAI/Anthropic/Google) para serializar la carga entre usuarios, respetar límites RPM/TPM y reintentar 429 con backoff honrando `Retry-After`; `insufficient_quota` aborta el job con mensaje claro en vez de fallar silenciosamente pregunta por pregunta.

### 1.3 Proveedores de IA
- `8893599` — **OpenRouter** como 5º proveedor: una sola API key da acceso a ChatGPT, Claude, Gemini y Perplexity con búsqueda web. Cubre el hueco de "Claude + búsqueda web" que la integración directa de Claude no tiene. Incluye modo avanzado (pegar cualquier model-id de OpenRouter).
- Mismo commit — **datos frescos en monitorizaciones semanales**: `configuration.bypassCache` salta la caché de 7 días para que las ejecuciones programadas no sirvan respuestas antiguas.

### 1.4 Automatizaciones (`3fc5d5f`)
- Sistema de `scheduled_reports`: informes LLM y AI Overview de forma diaria/semanal/mensual, con recovery automático de ejecuciones interrumpidas al reiniciar el servidor y soporte de zona horaria/DST.
- Cifrado AES-256-GCM de las API keys de usuario en BD (antes Base64), con migración idempotente. `API_KEY_ENCRYPTION_SECRET` es obligatorio en producción (el server aborta el arranque si falta).
- Tab "Automatizaciones" en el Intelligence Hub + banner global de salud que avisa si alguna automatización falló.

### 1.5 Multi-tenant y seguridad (`bcb2c02`, `3f0a64a`, `cbd75ab`)
- Aislamiento completo por usuario: `requireAuth` en projects/analysis/dashboard/templates (antes `optionalAuth`), filtrado por proyecto+usuario en History/Reports/Intelligence Hub/Dashboard.
- Reset de contraseña de usuarios desde el panel admin.
- Migración automática (una sola vez) de proyectos/análisis/configuraciones con `user_id = NULL` (datos pre-multi-tenant) clonándolos para cada usuario existente.

### 1.6 Admin (`1218d73`, `f842e6`)
- Export/import cross-user de datos (proyectos + análisis + AI Overviews) desde la pestaña Import/Export del panel admin, sin necesidad del script CLI.

### 1.7 AI Overview / DataForSEO (`ecbce60`)
- Export a Excel del análisis de AI Overview: pestaña resumen (Share of Voice, Gap Analysis, Overlap Matrix, Intent/Volume) + una pestaña por dominio con las keywords crudas de DataForSEO. Se persisten los datos crudos (`raw_data`) para poder exportarlos.

### 1.8 Infraestructura / Deploy
- Ajustes de `docker-compose.prod.yml` (build targets, red de Traefik explícita) y healthcheck de nginx.

---

## 2. Qué falta / pendiente

### 2.1 Del propio plan del Intelligence Hub (`Features de visualizacion/PLAN_*.md`)
Los documentos de planificación existentes marcan todo como no-completado (`- [ ]`), pero en la práctica ya está hecho casi todo. Comparando plan vs código real, esto es lo que **sí sigue pendiente**:

- **Sistema de Tags** (Hito 2.4 de `PLAN_DE_ATAQUE_Metricas.md`): tablas `tags`/`tag_assignments`, endpoints `/api/tags` y `TagSelector.tsx` para etiquetar menciones en Sentimiento/Topics. No hay ningún archivo ni endpoint de tags en el repo.
- **Recomendación de contenido por gap vía LLM**: la idea del antiguo "Insights AI" (retirado). El propio plan lo marca como "aparcado, concepto válido, ejecución a rehacer".
- **Peso de prompt por volumen de búsqueda**: requiere cruzar los gaps con datos de volumen de DataForSEO (ya integrado para AI Overview, pero no conectado a GAPS todavía). También marcado como aparcado en el plan.
- **Infraestructura de snapshots dedicada** (`metric_snapshots`, Sprint 2 de `PLAN_DE_ATAQUE.md`): nunca se construyó tal cual. En su lugar, los gráficos "over time" (Sentimiento, Citas) se calculan agrupando los análisis guardados por su `timestamp` real. Funciona, pero la granularidad depende de cuándo se ejecutan los análisis (no hay bucketing semanal fijo ni backfill garantizado si hay huecos largos sin ejecuciones).

### 2.2 Deuda técnica / infraestructura general
- **Sin tests automatizados**: no hay `*.test.ts`/`*.spec.ts` en el repo ni script `npm test`. Los cambios se verifican manualmente en navegador (así lo indican los propios commits).
- **Progreso en tiempo real**: se pasó de SSE a "job queue + polling" (`ba5ea7f`) para evitar 504 en Vercel/proxies, pero sigue sin ser push real-time (WebSockets), algo que ya se sugería en `OPTIMIZACIONES.md` y `MEJORAS_IMPLEMENTADAS.md` y nunca se implementó.
- **Caché solo en SQLite**: no hay Redis ni caché distribuida; no escala si se despliega en más de una instancia del API. Tampoco hay warmup automático de caché ni alertas cuando el hit-rate baja de cierto umbral (ambas ideas quedaron en "Próximas Mejoras Sugeridas" de `MEJORAS_IMPLEMENTADAS.md` desde noviembre y siguen sin hacerse).
- **Tendencia del dashboard sin calcular**: `api/routes/dashboard.ts:229` tiene un `TODO` — el campo `trend` está fijo en `'stable'` en vez de compararse contra el período anterior.

### 2.3 Documentación desactualizada
Varios documentos del repo describen un estado muy anterior al actual y pueden inducir a error si se leen como fuente de verdad:

- `README.md` no menciona Intelligence Hub, multi-tenant, OpenRouter, automatizaciones ni AI Overview — solo el análisis básico multi-IA original.
- `CLAUDE_CONTEXT.md` está fechado en diciembre 2025 / febrero 2026, antes de todo lo anterior.
- `MEJORAS_IMPLEMENTADAS.md` está fechado el 21 de noviembre de 2025 (caché + paralelización iniciales); sus "Próximas Mejoras Sugeridas" siguen siendo el pendiente real hoy (ver §2.2).
- `Features de visualizacion/PLAN_DE_ATAQUE.md` y `PLAN_DE_ATAQUE_Metricas.md` tienen checklists sin marcar (`- [ ]`) para trabajo que ya está hecho; conviene marcarlos o archivarlos para no confundir a quien los lea después.

---

## 3. Recomendación
Antes de arrancar trabajo nuevo, sería útil:
1. Marcar como completados los hitos ya hechos en `PLAN_DE_ATAQUE.md` / `PLAN_DE_ATAQUE_Metricas.md` (o archivarlos) para que reflejen la realidad.
2. Decidir si el Sistema de Tags y la conexión de volumen de búsqueda a GAPS siguen siendo prioritarios, o si se retiran del plan como el "Insights AI".
3. Actualizar `README.md` con las capacidades actuales (Intelligence Hub, multi-tenant, OpenRouter, automatizaciones) de cara a cualquier persona nueva que llegue al repo.
