# Plan de Mejoras — Pestaña "Métricas" (Intelligence Hub)

> **Origen:** brief de cliente `Medicion Pichincha.pdf` (Banco Pichincha) + capturas de referencia de `Features de visualizacion/`.
> **Motivo:** tras añadir Sentimiento / Topics / URLs-Citas, la pestaña **Métricas se ha quedado corta** en comparación. El PDF aporta un roadmap concreto y de alto valor.
> **Fecha:** 24 jun 2026 · **Stack:** React + TS + Tailwind + recharts · datos en cliente desde `allAnalysesDetails`.
> **Decisiones previas vigentes:** cambio aditivo, AIO en su tab (Opción B), sin entidad "Prompt" persistente.

---

## 1. Estado actual de "Métricas" (verificado)

`src/components/intelligence/MetricsDashboard.tsx` ya muestra:
- **KPIs**: Share of Voice, Posición media, Net Sentiment, Confianza IA.
- **Mapa de Posicionamiento** (scatter marca: menciones × sentimiento).
- **Share of Voice — Top Marcas** (tabla con sentimiento).
- **Marcas Descubiertas** (no configuradas).
- **Menciones por Categoría y Marca** (barras).
- **Evolución Histórica**: SoV (área), Tracking de Posición (línea), Sentimiento (línea).

**Conclusión:** la base es sólida. No hay que rehacerla; hay que **añadir** lo que pide el cliente, que hoy no existe en ningún sitio.

---

## 2. Lo que pide el PDF (Banco Pichincha) — 4 bloques

### 2.1 Glosario de marcas (unificar alias) ⭐
> "BIESS, biess, Instituto Ecuatoriano de Seguridad Social… son la misma marca. Molaría tener un glosario que permita unificar estas menciones."

El gráfico "Menciones por Marca" del PDF muestra la **misma entidad partida en varias filas** (Instituto Ecuatoriano…, BIESS, IESS, Biess). Hoy `normalizeBrandName` (`MetricsDashboard.tsx:91`) solo une variantes por *string normalizado* (mayúsc./espacios/guiones), **no alias semánticos**. Se necesita un **glosario editable** (marca canónica → lista de alias).

### 2.2 Menciones diferenciadas: mención vs citación vs blog ⭐
> Diferenciar: **incluye mención** (marca en el texto, sin enlace), **citación** (con link a pichincha.com), **citación a blog** (link a pichincha.com/blog).

- **KPI cards con delta vs análisis anterior**: "Menciones 47 ↑+8 (+21%)", "Citaciones a pichincha.com 23 ↓-3 (-12%)".
- **Tabla de menciones**: prompt · url citada · frase de la mención · fuentes citadas en la respuesta.
- **Tabla de citaciones**: prompt · url citada · frase · **posición frente a competencia** · **quién ocupa el nº 1**.

### 2.3 Detección de GAPS — Tab "Evolución temporal" ⭐⭐
> Tabla prompt × fecha con **código de color**: No aparece (rojo) · Mención (naranja) · Citación a .com (amarillo) · Citación al blog (verde).
- Col 1 = prompts; resto de columnas = análisis por fecha (10/06, 18/06, 03/07).
- Cada celda: punto de color según aparición + posición de la marca.
- Filtros: "Solo GAPS (no aparece)" + selector de competencia.

### 2.4 Detección de GAPS — Tab "Por competencia" ⭐⭐
> Sobre un informe, prompts donde la marca **no aparece en primer lugar** + columna con los competidores que sí aparecen.
- Badges de **Posición Pichincha**: "No aparece" / "pos. 3 — Mención" / "pos. 2 — pichincha.com".
- Filtros: selector de competidor + check "mostrar solo donde NO aparece la marca".

---

## 3. Qué aportan las capturas de referencia (Peec)

Refuerzan el bloque de **posición/competencia** de Métricas:
- *Position distribution over time* (apilado por bucket de posición) → enriquece "Tracking de Posición".
- *Citation position distribution* / *Your citation positions* (pies) → distribución de posiciones de la marca.
- *Net Sentiment Score (Ranking)* y *Sentiment by Brand* → ya implementados en la pestaña Sentimiento (reutilizables).

---

## 4. Gap analysis — datos disponibles vs nuevos

| Necesidad | ¿Datos hoy? | Acción |
|---|---|---|
| Frase de la mención | ✅ `brandMention.evidence[]` (`openaiService.ts:50`) | Usar |
| URL/dominio citado por respuesta | ✅ `question.sources[].{url,domain}` | Usar |
| Posición de la marca / quién es nº1 | ✅ `brandMention.appearanceOrder` | Calcular por pregunta |
| Citas por modelo | ✅ `multiModelAnalysis[].sourcesCited` | Usar |
| **Dominio de la marca objetivo** (para mención vs citación .com vs blog) | ❌ No existe (solo dominio de cada fuente) | **Nuevo**: campo de config `brandDomain` (+ patrón blog) |
| **Glosario de alias** (BIESS = Instituto…) | ❌ `normalizeBrandName` no hace alias | **Nuevo**: mapa editable canónico→alias |
| **Delta vs análisis anterior** (↑+8 +21%) | ⚠️ derivable comparando 2 análisis | Calcular en cliente (últimos 2) |
| **Matriz prompt × fecha** (GAPS temporal) | ⚠️ requiere **emparejar el mismo prompt entre análisis** | Match por texto del prompt / `questionId` estable |

---

## 5. Brechas de datos / backend (lo realmente nuevo)

### 5.1 Glosario de marcas (alias) — cross-cutting
Mejora TODOS los dashboards (SoV, menciones, GAPS), no solo Métricas.
- **Config**: `aliases: { canonical: string; variants: string[] }[]` por proyecto.
- **Backend**: tabla `brand_aliases` (o dentro de la config del proyecto) + endpoints CRUD.
- **Front**: editor de glosario (Configuración o modal en Métricas) + reemplazar `normalizeBrandName` por una versión que consulte el glosario.

### 5.2 Dominio de marca + patrón de blog
- **Config**: `brandDomain: string` (ej. `pichincha.com`) y `blogPattern` (ej. `/blog`).
- Clasificación de cada respuesta para la marca: `no_aparece | mencion | citacion_com | citacion_blog`, comparando `sources[].domain/url` con `brandDomain`.

### 5.3 Emparejado de prompts entre análisis (para GAPS temporal)
- Clave estable de prompt: normalizar `question.question` (texto) o usar `questionId` si es estable entre ejecuciones (verificar).
- Construir matriz `prompt × análisis(fecha)` con el estado de color por celda.

> *(Las series temporales se derivan en cliente de `allAnalysesDetails`, igual que el resto de dashboards. No se requiere la tabla de snapshots para esto.)*

---

## 6. Propuesta concreta de mejoras a "Métricas"

Se añaden a `MetricsDashboard.tsx` (o como sub-secciones plegables):

1. **KPI cards con delta** vs análisis anterior (Menciones, Citaciones .com, Citaciones blog, Posición). *(§2.2, §5.2)*
2. **Clasificación mención/citación**: tarjetas + dos tablas (menciones / citaciones con posición y nº1). *(§2.2)*
3. **Position distribution** (pie o barras apiladas por bucket de posición) + mejora del Tracking de Posición. *(§3)*
4. **Glosario de marcas**: editor + aplicar alias a SoV y "Menciones por Marca" (que dejaría de duplicar entidades). *(§2.1, §5.1)*

**Detección de GAPS (§2.3, §2.4)** → ✅ **DECIDIDO: tab propio "GAPS"** en el Intelligence Hub (las 2 vistas + filtros necesitan espacio).

---

## 7. Roadmap por fases (plan de ataque)

### Fase 1 — Glosario de marcas *(cimiento, máximo impacto transversal)*
- §5.1: config + CRUD + editor + `normalizeBrandName` con alias.
- Beneficia SoV, Menciones por Marca, Sentimiento, Citas. Arregla el problema #1 del cliente.

### Fase 2 — Menciones diferenciadas en Métricas
- §5.2 (brandDomain + blog) → clasificación.
- KPI cards con delta + tablas de menciones/citaciones (§2.2).

### Fase 3 — Detección de GAPS
- §5.3 (emparejado de prompts) + Tab/sección GAPS.
- 3a: Evolución temporal (matriz color). 3b: Por competencia (badges + filtros).

### Fase 4 — Position distribution (pulido)
- Buckets de posición (pie/barras) + mejora de Tracking de Posición. *(barato, datos ya existen.)*

> Orden por valor/cliente: **1 → 2 → 3** (3 es lo más vistoso pero depende del emparejado de prompts). La Fase 4 puede colarse en cualquier momento.

---

## 8. Componentes a crear/tocar

| Componente | Acción | Fase |
|---|---|---|
| `api` config de proyecto + `brand_aliases` / `brandDomain` | Nuevo (campos + CRUD) | 1,2 |
| `sharedMetrics.ts` → `normalizeBrandName` con glosario | Modificar | 1 |
| `src/pages/Configuration.tsx` o modal | Editor de glosario | 1 |
| `MetricsDashboard.tsx` | KPI delta + tablas menciones/citaciones + position distribution | 2,4 |
| `GapsDashboard.tsx` + tab en `IntelligenceHub` | Nuevo (evolución temporal + por competencia) | 3 |
| `sharedMetrics.ts` | helpers: clasificación mención/citación, emparejado de prompts, delta | 2,3 |

---

## 9. Decisiones

1. ~~GAPS: ¿tab propio o dentro de Métricas?~~ ✅ **RESUELTO: tab propio "GAPS".**
2. ~~Glosario: ¿dónde se edita?~~ ✅ **RESUELTO: en Configuración, editable por el propio usuario** (por proyecto).
3. **brandDomain: ¿campo manual o autodetección?** (Recomendado: manual en Configuración, junto al glosario — fiable.) — *pendiente, se cierra al llegar a Fase 2.*
4. **Emparejado de prompts** (GAPS temporal): ¿`questionId` o texto normalizado del prompt? — *se verifica al llegar a Fase 3.*
5. ~~Alcance del primer entregable~~ ✅ **RESUELTO: implementación incremental "poco a poco"** — ver `PLAN_DE_ATAQUE_Metricas.md`.

---

## 10. Encaje por pestaña (no todo va a Métricas) ⭐

Tras revisar la app entera, varias piezas del PDF **encajan mejor en pestañas que ya existen** que metiéndolas en Métricas. Reparto recomendado:

| Pieza del PDF | Mejor ubicación | Por qué |
|---|---|---|
| **Glosario de alias** (§2.1) | **Configuración** (cross-cutting) | Es un primitivo de datos; al resolverse, propaga a Métricas, Sentimiento, Comparar y GAPS. *(decidido)* |
| **Diferenciar mención / citación .com / citación blog** + tablas por prompt (url, frase, posición, nº1) (§2.2) | **URLs / Citas** (ampliar la pestaña existente) | Ya es la pestaña de citas/URLs (Citation rate, top dominios, top URLs, citations by model). Aquí encaja el desglose por tipo y la tabla por prompt — **no** una sección nueva en Métricas. |
| **KPI cards con delta** vs análisis anterior (Menciones ↑+8, Citaciones ↓-12%) (§2.2) | **Métricas** (fila de KPIs) | Son métricas-resumen; su sitio natural es la cabecera de Métricas (y opcionalmente la de URLs/Citas). |
| **Posición vs competencia / quién es nº1** por prompt (§2.2) | **Panel de detalle → "Respuestas por Modelo"** (ya existe) | Esa tabla ya tiene Posición #N; añadir columna "nº1 / vs competencia" es barato y es contexto de un único análisis. |
| **GAPS — evolución temporal** (matriz prompt × fecha) (§2.3) | **Tab nuevo "GAPS"** | No tiene hogar; es lo genuinamente nuevo. *(decidido)* |
| **GAPS — por competencia** (§2.4) | **Tab "GAPS"** | Conceptualmente roza *Comparar*, pero *Comparar* es a nivel de **análisis**, no de **prompt**. Va en GAPS. |

**Implicación:** el plan deja de ser "engordar Métricas" y pasa a **repartir**: Configuración (glosario), Métricas (KPIs con delta + position distribution), URLs/Citas (mención/citación + tablas por prompt), panel de detalle (nº1), y tab GAPS (matriz temporal + competencia). Esto mantiene cada pestaña enfocada y evita duplicar la lógica de citas que **ya** vive en URLs/Citas.

---

### Anexo — Mapa PDF → feature
`pág.1` → Glosario (§2.1) · `pág.2` → Menciones diferenciadas (§2.2) · `pág.3` → GAPS temporal (§2.3) · `pág.4` → GAPS competencia (§2.4)
