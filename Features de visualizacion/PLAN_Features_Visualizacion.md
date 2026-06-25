# Plan de Implementación — Nuevas Visualizaciones (Intelligence Hub)

> **Origen:** carpeta `Features de visualizacion/` (capturas de una herramienta de referencia de monitorización de marca en IA, estilo *Peec AI / Profound*).
> **Objetivo:** llevar el front de `mediciones_IA` al nivel visual y funcional de esas referencias.
> **Fecha:** 23 jun 2026 · **Autor:** preparado para dvillarrubia@lin3s.com
> **Stack actual:** React + TypeScript + Tailwind + **recharts** (única librería de gráficos) · API Express + SQLite (`data/analysis.db`).
> **Nota de alcance:** los módulos de **YouTube** y **Reddit** quedan **fuera de este plan** (descartados).

---

## 1. Resumen ejecutivo

Las capturas describen **4 módulos de visualización** dentro del alcance. Tras auditar el código actual, el reparto es:

| Módulo | Capturas | Estado actual | Veredicto |
|---|---|---|---|
| **A. Vista de Prompt individual** | 1–3 | Parcial (`AnalysisResultsViewer`, `multiModelAnalysis`, `Sparkline`) | **Reestructurar** |
| **B. Dashboard de Sentimiento** | 4–7 | Parcial (sentimiento ya se calcula; `MetricsDashboard` tiene SoV/sentimiento histórico) | **Ampliar** |
| **C. Topics** | 8–9 | Parcial (existe `category`, no "topics" granulares ni treemap) | **Ampliar** |
| **D. Análisis de URL / Citas** | 10–11 | Parcial (existen `sources[].url`/`domain`; faltan series temporales) | **Ampliar + datos nuevos** |

**Dependencia transversal crítica:** casi todos los gráficos "over time" exigen **snapshots periódicos persistidos**, algo que hoy **no existe de forma robusta** (los schedules solo guardan `last_analysis_id`, y el histórico se recalcula al vuelo desde análisis completos). Esto es el cimiento del que dependen B y D → **debe ir primero**.

---

## 1-bis. Dimensión transversal: Modelo / Proveedor / Fuente de datos ⭐

> **Requisito explícito:** un prompt puede lanzarse a distintas APIs (OpenAI, OpenRouter, Google, Anthropic, Perplexity) **y además** a DataForSEO (AI Overview). **Toda visualización debe representar esto correctamente.** Esto NO es opcional: es una dimensión que atraviesa los 4 módulos.

El código maneja **tres capas** que hay que distinguir (verificadas, ver Anexo B):

| Capa | Valores | Dónde vive | Para qué sirve en la UI |
|---|---|---|---|
| **Persona / Modelo** | `chatgpt · claude · gemini · perplexity` (`AIModelPersona`) | `multiModelAnalysis[].modelPersona` | Filtro "Models", series "by AI model", columna *Model* de la tabla de respuestas |
| **Proveedor / transporte** | `openai · anthropic · google · openrouter` (`AIModelInfo.provider`) | catálogo `AI_MODELS` / `OPENROUTER_MODELS`; **inferible de `modelId`** (los de OpenRouter llevan prefijo `openai/`, `google/…:online`) | Distinguir que la *misma* persona (p. ej. Gemini) puede venir de **dos proveedores** distintos; mostrar `modelName` real ("Gemini 3.5 Flash + Search") |
| **Fuente de datos / pipeline** | `LLM` (tabla `analysis`) vs `AIO` (tabla `ai_overview_analyses`, vía **DataForSEO**) | dos tablas y dos esquemas distintos | Decidir si AI Overview aparece como "un modelo más" o como módulo aparte |

**Implicaciones de diseño que el plan adopta:**

1. **`modelId` / `modelName` ya capturan persona + proveedor** (`multiModelAnalysis`, verificado `openaiService.ts:24`). La tabla de respuestas (Módulo A) y los desgloses "by model" se construyen con esto. El `provider` **no se persiste como columna**: se infiere de `modelId` o del catálogo `AI_MODELS`/`OPENROUTER_MODELS`. → conviene **normalizar** persona+proveedor en un helper compartido (cliente o backend) para etiquetar series de forma consistente.
2. **Las citas por modelo existen**: `multiModelAnalysis[].sourcesCited[]` (por modelo) además de las `sources` a nivel de pregunta → habilita "Citations by AI model" (Módulo D) sin datos nuevos. *(Ojo: `SourceCited` usa `url: string|null` + `type`/`credibility`; `AnalysisSource` usa `url`+`domain`+`isPriority`. Shapes distintos → unificar al agregar.)*
3. **DataForSEO / AI Overview es un pipeline separado** con esquema incompatible (no tiene sentimiento por mención; sí keywords/volumen/ETV). **No se puede fusionar 1:1** con las respuestas LLM. **DECISIÓN TOMADA (Opción B):** AIO **se mantiene en su tab `ai-overview` actual** — NO se integra como "un modelo más". Por tanto la herramienta de referencia se usa como inspiración visual, pero **la dimensión "modelo" de los Módulos A/B/C/D aplica solo al pipeline LLM** (`chatgpt · claude · gemini · perplexity`). No se construye capa de mapeo LLM↔AIO.

**Consecuencia para los snapshots (§4.1):** la clave de agregación debe incluir el **modelo** (persona LLM) y el **proveedor**, para los gráficos "by AI model over time". El campo `source` queda para mantener separados los snapshots LLM de los AIO (que viven en su tab), no para fusionarlos.

---

## 1-ter. Ubicación en la interfaz (mapa) ⭐

> **Filosofía: cambio ADITIVO, no rediseño.** Las pantallas actuales (Dashboard, Análisis de Marca, AI Overview, y las pestañas actuales de Métricas/Tendencias/Insights) **se quedan como están**. Se suman pestañas y se enriquece un panel existente. Mismo layout, misma navegación, mismos estilos (Tailwind + recharts).

Navegación verificada: menú lateral (`Layout.tsx:40-45`) = *Dashboard · Análisis de Marca · Importar Excel · AI Overview · Centro de Inteligencia · Configuración*. El **Centro de Inteligencia** (`/intelligence`, `IntelligenceHub.tsx`) ya tiene 7 pestañas: `list · trends · compare · insights · metrics · ai-overview · schedules`.

| Módulo | Ubicación exacta | Tipo de cambio |
|---|---|---|
| **B. Sentimiento** | Nueva pestaña en `/intelligence`, junto a *Métricas* | Añadir tab |
| **C. Topics** | Nueva pestaña en `/intelligence` | Añadir tab |
| **D. URLs/Citas** | Nueva pestaña en `/intelligence` | Añadir tab |
| **A. Detalle de respuestas** | **Enriquecer el panel lateral existente** (`AnalysisResultsViewer`, abierto desde la pestaña *Lista* — `IntelligenceHub.tsx:2314`, panel `showDetailPanel`) | Mejorar componente existente |
| **AIO** | Su pestaña `ai-overview` / página `/ai-overview` actual | **Sin cambios** (Opción B) |

**Decisión sobre Módulo A — RESUELTA: se adapta al modelo actual.** La app está organizada en torno a **"Análisis"** (una ejecución con muchas preguntas) y el detalle abre en **panel lateral**, no en página propia. Las capturas de referencia giran en torno a una entidad **"Prompt"** con página e histórico propios. **No se introduce la entidad "Prompt".** En su lugar, el Módulo A se implementa **enriqueciendo `AnalysisResultsViewer`** con: cabecera de métricas (Brand Mentions, Mention Rate, Citations, Position) y la **tabla de respuestas por modelo** (datos de `multiModelAnalysis`, ver §2.A). Menos disruptivo y reutiliza el panel que ya existe.

---

## 2. Inventario detallado de features (por captura)

### Módulo A — Vista de Prompt individual (capturas 1, 2, 3)
- **Cabecera de Prompt**: título del prompt + ID (`#107641`) + botón *Create Content*.
- **Barra de filtros**: búsqueda de respuestas, rango de fechas (*Last 30 days*), selector de modelos (*All Models 5*).
- **Fila de metadatos**: Responses, Country (con bandera), Language, Last Execution, Creation Date.
- **4 tarjetas de métrica con sparkline**: Brand Mentions, Mention Rate, Citations, Position.
- **Tabla de Responses** (cap. 2): una fila por respuesta de IA — Response (extracto), Model (icono), Status (badge Success/No Results), Brand Sentiment, Mention Position, Top Mentions, Citation Position, Top Citations (logos), Execution Date. Paginada.
  > **Verificado:** `MultiModelAnalysis` (`openaiService.ts:24`) **ya persiste por modelo**: `modelName`, `response`, `brandMentions[]` (con `appearanceOrder`, `detailedSentiment`), `overallSentiment`, `sourcesCited[]`, `confidenceScore`. La tabla es construible **casi al 100 % con datos actuales**; solo falta maquetarla.
- **Detalle de Response** (cap. 3): respuesta completa del modelo + bloque de Citations enumeradas con favicon/título/URL.

### Módulo B — Sentimiento (capturas 4, 5, 6, 7)
- **Filtros** ampliados: fecha, modelos, **Sentiments**, **Tags**, **Topics**.
- **Sentiment Distribution**: barras apiladas por fecha (Very Positive→Very Negative).
- **Share of Sentiment Over Time**: área apilada 100 % temporal.
- **Share of Sentiment** (pie) + **Net Sentiment Score (Ranking)**: tabla marca→net sentiment %.
- **Sentiment by Brand**: tabla con barra de *split* (positivas/neutras/negativas con conteos).
- **Sentiment Details**: tabla por mención — Brand, Sentiment (editable), Explanation, Prompt, Model, Response, **Topics** (chips), **Tags** (añadibles).

### Módulo C — Topics (capturas 8, 9)
- **Topics treemap**: rectángulos proporcionales a nº de menciones (flexibility 176, pricing 77…).
- **Topic Details**: tabla Topic, Mentions, Sentiment Breakdown (barra), % Positive/Negative/Neutral, Net Sentiment.

### Módulo D — Análisis de URL / Citas (capturas 10, 11)
- **Buscador de URL**: Match Mode (URL exact), términos, *Only my domain*, *Run report*, rango.
- **AI Metrics**: AI Citations, Citation Rate, Brand Mentions, Brand Sentiment (sobre ejecuciones que citan esa URL).
- **Trends** (6 gráficos temporales): Citations over time, Citation rate over time, Mentions over time, Sentiment over time, Position distribution over time (apilado por bucket), Citations by AI model.

---

## 3. Mapeo estado actual ↔ deseado (gap analysis)

| # | Feature | ¿Datos hoy? | ¿UI hoy? | Acción |
|---|---|---|---|---|
| A | Prompt como entidad con métricas históricas | ⚠️ análisis sí, "prompt persistente" no | ❌ | Modelar `prompt` + serie histórica |
| A | Tabla de respuestas por modelo | ✅ `multiModelAnalysis[]` | ⚠️ parcial | Construir tabla nueva |
| A | Sparklines de métrica | n/d | ✅ `Sparkline.tsx` | Reutilizar |
| B | Sentimiento por mención | ✅ `detailedSentiment` | ⚠️ disperso | Centralizar dashboard |
| B | Distribución / share over time | ⚠️ requiere snapshots | ⚠️ `MetricsDashboard` línea | Necesita snapshots (§4.1) |
| B | Net sentiment ranking / by brand | ✅ derivable | ❌ | Construir |
| B | **Tags** sobre respuestas/menciones | ❌ no existe | ❌ | Tabla `tags` nueva |
| C | Topics granulares (≠ categorías) | ⚠️ solo `category` | ❌ | Extracción de topics (§4.2) |
| C | Treemap | n/d | ❌ (recharts tiene `Treemap`) | Usar `Treemap` de recharts |
| D | Citas/URL/dominio | ✅ `sources[]` | ⚠️ Top dominios | Vista de URL nueva |
| D | Métricas de URL over time | ❌ snapshots | ❌ | Necesita snapshots (§4.1) |

---

## 4. Brechas de datos / backend (lo que hay que construir)

### 4.1 ⭐ Snapshots de series temporales *(cimiento — bloquea B y D)*
Hoy `scheduled_reports` solo guarda `last_analysis_id` y el histórico se recalcula al vuelo desde análisis completos (impreciso y caro).

**Propuesta:** tabla de snapshots resumidos por ejecución.
```sql
CREATE TABLE metric_snapshots (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  analysis_id   TEXT,              -- origen
  snapshot_date TEXT NOT NULL,     -- ISO date (bucket diario/semanal)
  scope         TEXT NOT NULL,     -- 'project' | 'prompt' | 'url' | 'brand' | 'model'
  scope_key     TEXT,              -- id de prompt/url/brand/persona según scope
  source        TEXT NOT NULL,     -- 'llm' | 'aio'  ← pipeline separado (NO se fusionan; AIO en su tab)
  model_persona TEXT,              -- 'chatgpt'|'claude'|'gemini'|'perplexity' (NULL = agregado). AIO no usa este eje
  provider      TEXT,              -- 'openai'|'anthropic'|'google'|'openrouter' (NULL = agregado)
  metrics_json  TEXT NOT NULL,     -- { sov, sentiment{vp,p,n,neg,vneg}, citations, mentionRate, avgPosition }
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_snap_scope ON metric_snapshots(project_id, scope, scope_key, source, model_persona, snapshot_date);
```
- **Clave por modelo/proveedor/pipeline** (ver §1-bis): sin `source`/`model_persona`/`provider` los gráficos "by AI model over time" y la separación LLM↔AIO son imposibles. Se persiste **una fila por (fecha × modelo)** además de la fila agregada (`model_persona = NULL`).
- Escribir un snapshot al final de cada ejecución (manual y programada) en `schedulerService.ts` / al guardar análisis en `databaseService.ts` (LLM) y en el flujo AIO (`aiOverview.ts` / `schedulerService.ts:266`).
- Endpoint `GET /api/metrics/timeseries?scope=&key=&source=&model=&from=&to=&bucket=` que sirve todos los gráficos "over time", con filtro por modelo y por pipeline.

### 4.2 Extracción de Topics granulares *(Módulo C)*
Hoy solo existe `question.category`. Las capturas muestran topics extraídos del contenido (flexibility, pricing, reputation…), no la categoría de la pregunta.
- Añadir paso en `openaiService.ts` (fase 2 de análisis) que extraiga 1–N topics por mención con su sentimiento, o un post-proceso por lotes.
- Persistir en `results.questions[].brandMentions[].topics: string[]` (extiende el JSON; no requiere DDL).
- Agregación en backend o cliente para treemap + Topic Details.

### 4.3 Clasificación de fuentes *(YA EXISTE — no requiere trabajo)*
> **Verificado en código:** ya hay un clasificador `classifySourceType()` (`api/services/openaiService.ts:1412`) y el campo `SourceCited.type` (`'website' | 'study' | 'organization' | 'media' | 'government' | 'other'`). Clasifica por **categoría/credibilidad**, no por plataforma. Para el Módulo D basta con `AnalysisSource.{url, domain, isPriority}`, que **ya se capturan**. No se necesita campo nuevo.

### 4.4 Sistema de Tags *(Módulo B — único dato realmente nuevo, además de §4.1/§4.2)*
```sql
CREATE TABLE tags (
  id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT, name TEXT, color TEXT, created_at INTEGER
);
CREATE TABLE tag_assignments (
  id TEXT PRIMARY KEY, tag_id TEXT, target_type TEXT, target_id TEXT, created_at INTEGER
);
```
+ endpoints CRUD `/api/tags`.

---

## 5. Componentes de front a crear/modificar

| Componente | Acción | Notas |
|---|---|---|
| `src/pages/IntelligenceHub.tsx` | Modificar | Añadir tabs: **Sentimiento**, **Topics**, **URLs/Citas** (junto a los 7 actuales) |
| `src/components/analysis/AnalysisResultsViewer.tsx` | **Enriquecer** | Módulo A: cabecera de métricas + tabla de respuestas por modelo (`multiModelAnalysis`). **No** se crea entidad "Prompt" |
| `src/components/intelligence/SentimentDashboard.tsx` | Nuevo | Módulo B |
| `src/components/intelligence/TopicsDashboard.tsx` | Nuevo | Módulo C (recharts `Treemap`) |
| `src/components/intelligence/UrlCitationsDashboard.tsx` | Nuevo | Módulo D |
| `src/components/intelligence/charts/` | Ampliar | `StackedSentimentBar`, `SentimentAreaChart`, `SplitBar`, `TopicTreemap`, `MiniPie` |
| `src/components/dashboard/Sparkline.tsx` | Reutilizar | KPIs de Módulo A/D |
| `src/components/intelligence/TagSelector.tsx` | Nuevo | Tags compartido B |

**Todo es construible con `recharts`** (incluye `Treemap`, `PieChart`, `AreaChart` apilada, `BarChart` apilada/horizontal). No hace falta nueva librería.

---

## 6. Roadmap por fases (priorizado)

> Criterio: maximizar valor con los **datos que ya tenemos**.

### Fase 0 — Cimiento de datos *(habilitador)*
- §4.1 Tabla `metric_snapshots` + escritura en cada ejecución + endpoint timeseries.
- **Sin esto, los "over time" son falsos.** Empezar aquí.
- *(La clasificación de fuentes ya existe — §4.3 — no requiere trabajo.)*

### Fase 1 — Sentimiento + Topics *(máximo valor, datos ya disponibles)*
- Módulo B (Sentiment Dashboard) — usa `detailedSentiment` ya existente + snapshots de Fase 0.
- Módulo C (Topics) — requiere §4.2 (extracción) + treemap.
- §4.4 Tags (opcional dentro de esta fase).

### Fase 2 — Vista de Prompt + URLs/Citas
- Módulo A (Prompt detail con tabla de respuestas por modelo, datos en `multiModelAnalysis`).
- Módulo D (URL citations) — usa `sources[]` + snapshots scope `url`.

---

## 7. Decisiones abiertas (requieren tu input)

1. ~~**AI Overview (DataForSEO) unificado o aparte**~~ ✅ **RESUELTO → Opción B**: AIO se **mantiene en su tab `ai-overview` separado**. No se integra como "un modelo más" ni se construye capa de mapeo. La dimensión "modelo" aplica solo al pipeline LLM (§1-bis).
2. **Granularidad del eje "modelo"**: ¿los desgloses van por **persona** (chatgpt/gemini/…) o por **proveedor** (openai/openrouter/…)? Recomendación: persona como eje primario y proveedor como sub-filtro, porque la misma persona puede venir de 2 proveedores.
3. **Snapshots**: ¿bucket diario o semanal? (las referencias usan semanal — coincide con la frecuencia de monitorización actual).
4. **Topics**: ¿extracción vía LLM (coste por análisis) o reutilizar `category` como topic provisional?
5. ~~**Prompt como entidad**~~ ✅ **RESUELTO**: se **adapta al modelo actual** (centrado en "Análisis"). No se crea entidad "Prompt"; el Módulo A enriquece el panel lateral `AnalysisResultsViewer` (ver §1-ter).
6. **Alcance del primer entregable**: ¿Fase 0+1 como MVP visual, o priorizar otro módulo?

---

## 8. Riesgos

- **Series temporales sin histórico previo**: los gráficos "over time" nacerán vacíos; se llenan a medida que corren ejecuciones. Considerar *backfill* desde análisis ya guardados (tienen `timestamp`).
- **Coste LLM** si se añade extracción de topics por mención.
- **Normalización de marcas/dominios**: ya hay `normalizeBrandName`; reutilizar para evitar duplicados en rankings.
- **Volumen de datos** en `multiModelAnalysis` para tablas de respuestas: paginar en backend.

---

### Anexo A — Mapa captura → módulo
`1,2,3` → A · `4,5,6,7` → B · `8,9` → C · `10,11` → D

---

### Anexo B — Verificación contra el código (auditoría, 23 jun 2026)
Cada afirmación del plan se comprobó **directamente** sobre el repo. Referencias reales:

| Afirmación | Verificado en | Resultado |
|---|---|---|
| recharts es la única librería de gráficos | `package.json` (`recharts ^2.13.3`) | ✅ Confirmado |
| `Treemap` disponible (Módulo C) | `node_modules/recharts/types/chart/Treemap.d.ts` | ✅ Existe |
| `Sparkline` reutilizable (Módulo A) | `src/components/dashboard/Sparkline.tsx` | ✅ Existe |
| `normalizeBrandName` reutilizable | `src/components/intelligence/MetricsDashboard.tsx:91` | ✅ Existe |
| `multiModelAnalysis` por modelo (Módulo A) | `api/services/openaiService.ts:24` (interface), `:3190` (persistido en results) | ✅ Rico: response, brandMentions, overallSentiment, sourcesCited, confidenceScore |
| `detailedSentiment` (vp/p/n/neg/vneg) (Módulo B) | `openaiService.ts:55`, `:2998` | ✅ Existe |
| `AnalysisSource` con url/domain/isPriority (Módulo D) | `openaiService.ts:36` | ✅ Existe |
| `appearanceOrder` (posición de mención) | `openaiService.ts:52` | ✅ Existe |
| `category` por pregunta (Módulo C) | `openaiService.ts:104` | ✅ Existe (no "topics" granulares) |
| Clasificación de fuentes ya existe | `openaiService.ts:1412` (`classifySourceType`), `:66` (`SourceCited.type`) | ✅ Existe (por categoría, no plataforma) — corrige §4.3 |
| **NO** existe tabla de snapshots temporales | `grep metric_snapshots api/` → 0 resultados | ✅ Confirmado: hay que crearla (§4.1) |
| `scheduled_reports` solo guarda `last_analysis_id` | `api/services/databaseService.ts:205-228` | ✅ Confirmado (sin snapshot de métricas) |
| Tabla `ai_overview_analyses` existe (pipeline DataForSEO) | `api/routes/aiOverview.ts:30` | ✅ Existe (esquema distinto al de `analysis`) |
| Persona de modelo (`AIModelPersona`) | `openaiService.ts:12` | ✅ `chatgpt \| claude \| gemini \| perplexity` |
| Proveedores soportados | `api/config/constants.ts:12` + `OPENROUTER_MODELS:322` | ✅ `openai \| anthropic \| google \| openrouter` (+ DataForSEO para AIO) |
| Routing por proveedor | `openaiService.ts:594` (switch), `:564` (`inferPersonaFromModelId`) | ✅ Misma persona puede venir de varios proveedores; provider inferido de `modelId` |
| Citas **por modelo** (no solo por pregunta) | `openaiService.ts` (`MultiModelAnalysis.sourcesCited`) | ✅ Existe → habilita "Citations by AI model" |
| 7 tabs en IntelligenceHub | `src/pages/IntelligenceHub.tsx:138` | ✅ `list, trends, compare, insights, metrics, ai-overview, schedules` |
| **NO** hay integración Reddit/YouTube | `grep` en `api/` → 0 resultados | ✅ Confirmado (módulos descartados, fuera de alcance) |

**Conclusión de la auditoría:** el plan es sólido. Lo único realmente nuevo a nivel de datos es **§4.1 (snapshots temporales)**, **§4.2 (topics granulares, opcional)** y **§4.4 (tags)**. Los Módulos A, B y D se apoyan mayoritariamente en campos que **ya se capturan y persisten**.
