# Plan de Ataque — Implementación de Visualizaciones

> Documento de **ejecución** (qué hacer y en qué orden). El **qué/por qué/datos** está en `PLAN_Features_Visualizacion.md` (mismo directorio).
> **Decisiones cerradas:** AIO se queda en su tab (Opción B) · Módulo A se adapta al modelo "Análisis" (no se crea entidad "Prompt") · cambio **aditivo**, sin rediseño.
> **Stack:** React + TS + Tailwind + recharts · API Express + SQLite.

---

## Criterio de orden

Maximizar **valor visible temprano** sin bloquearse en el cimiento. Por eso **no** seguimos el orden de dependencias puro (que empezaría por snapshots, invisible al usuario): primero lo que se construye con **datos que ya existen** y se ve enseguida; en paralelo, el cimiento temporal.

Regla de oro: **todo gráfico "over time" necesita snapshots (Sprint 2)**. Todo lo demás (estático, agregado del momento) se puede hacer **ya**.

---

## Sprint 1 — Quick win sin datos nuevos *(Módulo A + Sentimiento estático)*
**Objetivo:** entregar valor visible en días, solo maquetando datos que ya se persisten.

- [ ] **1.1 Tabla de respuestas por modelo** (Módulo A) — enriquecer `src/components/analysis/AnalysisResultsViewer.tsx`.
  - Datos: `results.questions[].multiModelAnalysis[]` → `modelName`, `response`, `overallSentiment`, `brandMentions[].appearanceOrder`, `sourcesCited[]`.
  - Columnas: Response (extracto), Model, Brand Sentiment, Mention Position, Top Mentions, Top Citations, fecha.
- [ ] **1.2 Cabecera de métricas** del panel de detalle: Brand Mentions, Mention Rate, Citations, Position (agregado del propio análisis) + `Sparkline.tsx` (ya existe).
- [ ] **1.3 Tab "Sentimiento" (parte estática)** — nuevo tab en `IntelligenceHub.tsx`, nuevo `SentimentDashboard.tsx`.
  - Share of Sentiment (pie), Net Sentiment Score (ranking por marca), Sentiment by Brand (barra split), Sentiment Details (tabla por mención).
  - Datos: `brandMentions[].detailedSentiment` (ya existe). Helper compartido `sentimentToNumeric` (reusar de `MetricsDashboard.tsx`).
- [ ] **1.4 Eje "modelo"**: helper compartido para etiquetar persona+proveedor desde `modelId`/`modelName` (chatgpt/claude/gemini/perplexity). Usado por 1.1 y por los desgloses "by model".

**Entregable:** panel de detalle de análisis con tabla de respuestas por modelo + tab Sentimiento operativo (sin series temporales todavía).

---

## Sprint 2 — Cimiento temporal *(snapshots)*  ⚠️ habilitador
**Objetivo:** que existan series históricas reales por fecha y por modelo.

- [ ] **2.1 Tabla `metric_snapshots`** (DDL en `PLAN_Features_Visualizacion.md §4.1`) en `databaseService.ts` (+ migración).
- [ ] **2.2 Escritura de snapshot** al cerrar cada ejecución:
  - LLM: al guardar análisis (`databaseService.ts`) y desde el scheduler (`schedulerService.ts`).
  - Clave por `(fecha × modelo × proveedor)` + fila agregada.
- [ ] **2.3 Backfill** desde análisis ya guardados (tienen `timestamp`) → poblar histórico inicial para que los gráficos no nazcan vacíos.
- [ ] **2.4 Endpoint** `GET /api/metrics/timeseries?scope=&key=&source=&model=&from=&to=&bucket=`.

**Entregable:** API de series temporales lista. (Sin UI nueva todavía — es infraestructura.)

---

## Sprint 3 — Conectar lo temporal *(Sentimiento over time + URLs/Citas)*
**Objetivo:** enchufar los gráficos "over time" al cimiento del Sprint 2.

- [ ] **3.1 Sentimiento over time**: añadir a `SentimentDashboard.tsx` → Sentiment Distribution (barras apiladas por fecha) + Share of Sentiment Over Time (área apilada 100 %).
- [ ] **3.2 Tab "URLs/Citas"** (Módulo D) — nuevo `UrlCitationsDashboard.tsx`.
  - Buscador de URL + AI Metrics (Citations, Citation Rate, Brand Mentions, Brand Sentiment).
  - Trends: Citations over time, Citation rate over time, Mentions over time, Sentiment over time, Position distribution over time, **Citations by AI model** (usa `multiModelAnalysis[].sourcesCited`).
  - Datos: `AnalysisSource{url,domain,isPriority}` + snapshots scope `url`.

**Entregable:** Sentimiento con evolución temporal + tab de análisis de URLs/citas completo.

---

## Sprint 4 — Topics + Tags
**Objetivo:** cerrar los módulos que requieren dato nuevo (extracción / etiquetado).

- [ ] **4.1 Decisión previa (#4):** topics vía LLM (coste por análisis) **o** reusar `category` como provisional. *(Bloquea 4.2.)*
- [ ] **4.2 Extracción de topics** (si se elige LLM): paso en `openaiService.ts` (fase 2) → `brandMentions[].topics: string[]` (extiende JSON, sin DDL).
- [ ] **4.3 Tab "Topics"** — nuevo `TopicsDashboard.tsx`: treemap (`Treemap` de recharts) + Topic Details (tabla con sentiment breakdown y net sentiment).
- [ ] **4.4 Sistema de Tags** (§4.4): tablas `tags`/`tag_assignments` + endpoints CRUD `/api/tags` + `TagSelector.tsx` (integrado en Sentiment Details y Topics).

**Entregable:** tabs Topics y etiquetado funcionando.

---

## Resumen de orden y dependencias

```
Sprint 1 (Módulo A + Sentimiento estático)   ──┐  (datos existentes, valor inmediato)
Sprint 2 (snapshots: tabla+escritura+backfill) ─┤  (cimiento, sin UI)
Sprint 3 (over time + URLs/Citas)  ◄── depende de Sprint 2
Sprint 4 (Topics + Tags)           ◄── 4.2 depende de decisión #4
```
- Sprint 1 y Sprint 2 pueden ir **en paralelo** (no dependen entre sí).
- Sprint 3 **requiere** Sprint 2.
- Sprint 4 es independiente salvo la decisión de topics.

---

## Componentes a tocar (resumen)

| Archivo | Acción | Sprint |
|---|---|---|
| `src/components/analysis/AnalysisResultsViewer.tsx` | Enriquecer (tabla respuestas + cabecera) | 1 |
| `src/pages/IntelligenceHub.tsx` | Añadir tabs Sentimiento / URLs-Citas / Topics | 1,3,4 |
| `src/components/intelligence/SentimentDashboard.tsx` | Nuevo | 1,3 |
| `src/components/intelligence/UrlCitationsDashboard.tsx` | Nuevo | 3 |
| `src/components/intelligence/TopicsDashboard.tsx` | Nuevo | 4 |
| `src/components/intelligence/TagSelector.tsx` | Nuevo | 4 |
| `src/components/intelligence/charts/*` | Ampliar (StackedSentimentBar, SentimentArea, SplitBar, TopicTreemap, MiniPie) | 1,3,4 |
| `api/services/databaseService.ts` | Tabla `metric_snapshots` + escritura + backfill | 2 |
| `api/services/schedulerService.ts` | Escribir snapshot en ejecuciones programadas | 2 |
| `api/routes/analysis.ts` (o nuevo `metrics.ts`) | Endpoint `/api/metrics/timeseries` | 2 |
| `api/services/openaiService.ts` | Extracción de topics (si decisión LLM) | 4 |
| `api/routes/tags.ts` + `databaseService.ts` | Tags CRUD + tablas | 4 |

---

## Decisión pendiente para arrancar
- **#4 Topics**: ¿LLM (coste) o reusar `category`? — solo bloquea el Sprint 4.
- **#6 Alcance MVP**: recomendado **Sprint 1 + Sprint 2** como primer entregable (valor visible + cimiento).
- Menores: bucket de snapshot (diario/semanal — recomendado **semanal**, coincide con la monitorización actual) y eje de desglose (persona primaria, proveedor como sub-filtro).
