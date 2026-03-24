# Especificación de Dashboards para Looker Studio

## Conexión de Datos

**Origen**: BigQuery
**Proyecto GCP**: `iberdrola-spain-367412`
**Dataset**: `seo_ias`

### Tablas disponibles

| Tabla | Descripción | Granularidad |
|-------|-------------|-------------|
| `analyses` | Metadata de cada análisis ejecutado | 1 fila por análisis |
| `brand_mentions` | Menciones de marca por pregunta | 1 fila por marca × pregunta × análisis |
| `sources` | Fuentes web citadas en los análisis | 1 fila por fuente × pregunta |
| `ai_overview_sov` | Share of Voice en AI Overviews por dominio | 1 fila por dominio × análisis |
| `ai_overview_gaps` | Keywords donde competidores aparecen y el target no | 1 fila por keyword × análisis |
| `ai_overview_top_pages` | Páginas más citadas en AI Overviews | 1 fila por página × análisis |

### Campos comunes (en todas las tablas)

| Campo | Tipo | Uso |
|-------|------|-----|
| `analysis_id` | STRING | Clave para cruzar tablas |
| `client_name` | STRING | **Filtro principal**: agrupa por cliente |
| `project_name` | STRING | **Filtro secundario**: separa proyectos del mismo cliente |
| `analysis_timestamp` | TIMESTAMP | Eje temporal para evolución (particionado) |
| `loaded_at` | TIMESTAMP | Cuándo se cargaron los datos |

---

## DASHBOARD 1: Métricas de Marca (LLM Analysis)

> Replica la pestaña "Métricas" del Intelligence Hub.
> **Tabla principal**: `brand_mentions`
> **Tabla auxiliar**: `analyses`, `sources`

### 1.1 KPI Cards (fila superior, 4 tarjetas)

**KPI 1 — Share of Voice (%)**
```sql
-- SoV del target = % de menciones que son de la marca objetivo
SELECT
  ROUND(COUNTIF(is_target AND mentioned) * 100.0 / NULLIF(COUNTIF(mentioned), 0), 1) AS sov_pct
FROM `seo_ias.brand_mentions`
WHERE analysis_id = @latest_analysis_id
```
- Color: Azul (#3b82f6)
- Mostrar con indicador de tendencia (comparar con análisis anterior)

**KPI 2 — Posición Promedio**
```sql
-- Posición media de aparición (1 = primera mención, menor = mejor)
SELECT
  ROUND(AVG(appearance_order), 1) AS avg_position
FROM `seo_ias.brand_mentions`
WHERE analysis_id = @latest_analysis_id
  AND is_target = TRUE
  AND mentioned = TRUE
  AND appearance_order > 0
```
- Color: Morado (#a855f7)
- Escala invertida: valores bajos = mejor

**KPI 3 — Sentimiento Neto**
```sql
-- Escala: very_negative=-2, negative=-1, neutral=0, positive=+1, very_positive=+2
SELECT ROUND(AVG(
  CASE sentiment
    WHEN 'very_positive' THEN 2
    WHEN 'positive' THEN 1
    WHEN 'neutral' THEN 0
    WHEN 'negative' THEN -1
    WHEN 'very_negative' THEN -2
    ELSE 0
  END
), 2) AS net_sentiment
FROM `seo_ias.brand_mentions`
WHERE analysis_id = @latest_analysis_id
  AND is_target = TRUE
  AND mentioned = TRUE
```
- Color: Verde (#10b981) si positivo, Rojo (#ef4444) si negativo

**KPI 4 — Confianza IA (%)**
```sql
SELECT ROUND(overall_confidence * 100, 1) AS confidence_pct
FROM `seo_ias.analyses`
WHERE analysis_id = @latest_analysis_id
```
- Color: Cyan (#06b6d4)

---

### 1.2 Gráfico de Posicionamiento de Marca (Scatter Chart)

- **Tipo**: Gráfico de dispersión (bubble chart)
- **Eje X**: Número de menciones (`frequency` sumado por marca)
- **Eje Y**: Sentimiento promedio (escala -2 a +2)
- **Color**: Azul (#3b82f6) para target, Gris (#9ca3af) para competidores
- **Tamaño burbuja**: Opcional, por frecuencia total
- **Línea de referencia**: Horizontal en Y=0 (sentimiento neutro)

```sql
SELECT
  brand_name,
  is_target,
  SUM(frequency) AS total_mentions,
  ROUND(AVG(CASE sentiment
    WHEN 'very_positive' THEN 2 WHEN 'positive' THEN 1
    WHEN 'neutral' THEN 0 WHEN 'negative' THEN -1
    WHEN 'very_negative' THEN -2 ELSE 0
  END), 2) AS avg_sentiment
FROM `seo_ias.brand_mentions`
WHERE analysis_id = @latest_analysis_id AND mentioned = TRUE
GROUP BY brand_name, is_target
```

---

### 1.3 Tabla Ranking Share of Voice

| # | Marca | Menciones | SoV % | Sentimiento |
|---|-------|-----------|-------|-------------|
| 1 | Banco Pichincha | 45 | 32.1% | +0.85 |
| 2 | Banco Guayaquil | 38 | 27.1% | +0.42 |
| ... | | | | |

```sql
SELECT
  brand_name,
  COUNTIF(mentioned) AS menciones,
  ROUND(COUNTIF(mentioned) * 100.0 / SUM(COUNTIF(mentioned)) OVER(), 1) AS sov_pct,
  ROUND(AVG(CASE sentiment
    WHEN 'very_positive' THEN 2 WHEN 'positive' THEN 1
    WHEN 'neutral' THEN 0 WHEN 'negative' THEN -1
    WHEN 'very_negative' THEN -2 ELSE 0
  END), 2) AS avg_sentiment
FROM `seo_ias.brand_mentions`
WHERE analysis_id = @latest_analysis_id AND mentioned = TRUE
GROUP BY brand_name
ORDER BY menciones DESC
LIMIT 10
```

---

### 1.4 Marcas Descubiertas

- **Tipo**: Tabla simple
- **Contenido**: Marcas con `is_discovered = TRUE` que la IA mencionó pero no estaban configuradas

```sql
SELECT DISTINCT brand_name, COUNT(*) AS veces_mencionada
FROM `seo_ias.brand_mentions`
WHERE analysis_id = @latest_analysis_id
  AND is_discovered = TRUE AND mentioned = TRUE
GROUP BY brand_name
ORDER BY veces_mencionada DESC
```

---

### 1.5 Top 10 Dominios Citados (Bar Chart horizontal)

- **Tipo**: Barras horizontales
- **Eje X**: Cantidad de citaciones
- **Eje Y**: Dominio

```sql
SELECT domain, COUNT(*) AS citations
FROM `seo_ias.sources`
WHERE analysis_id = @latest_analysis_id
  AND domain IS NOT NULL AND domain != ''
GROUP BY domain
ORDER BY citations DESC
LIMIT 10
```

---

### 1.6 Rendimiento por Categoría de Pregunta

- **Tipo**: Radar chart (si Looker lo soporta) o barras agrupadas
- **Dimensión**: `question_category`
- **Métricas por categoría**:
  1. Cantidad de preguntas
  2. Sentimiento promedio
  3. Confianza promedio

```sql
SELECT
  question_category,
  COUNT(DISTINCT question_id) AS preguntas,
  ROUND(AVG(CASE sentiment
    WHEN 'very_positive' THEN 2 WHEN 'positive' THEN 1
    WHEN 'neutral' THEN 0 WHEN 'negative' THEN -1
    WHEN 'very_negative' THEN -2 ELSE 0
  END), 2) AS sentimiento,
  ROUND(AVG(confidence_score), 2) AS confianza
FROM `seo_ias.brand_mentions`
WHERE analysis_id = @latest_analysis_id AND is_target = TRUE
GROUP BY question_category
```

---

### 1.7 Evolución Histórica (3 gráficos de líneas / áreas)

> Requiere **2+ análisis** del mismo proyecto en distintas fechas.
> Filtrar por `project_name` y ordenar por `analysis_timestamp`.

**Gráfico A — Evolución Share of Voice (Area Chart apilado)**
- **Eje X**: Fecha (analysis_timestamp)
- **Eje Y**: SoV % (0-100%)
- **Series**: Una por marca (top 8), apiladas

```sql
SELECT
  a.analysis_timestamp,
  bm.brand_name,
  COUNTIF(bm.mentioned) AS menciones,
  ROUND(COUNTIF(bm.mentioned) * 100.0 /
    SUM(COUNTIF(bm.mentioned)) OVER(PARTITION BY a.analysis_id), 1) AS sov_pct
FROM `seo_ias.brand_mentions` bm
JOIN `seo_ias.analyses` a ON bm.analysis_id = a.analysis_id
WHERE bm.project_name = @project_name
GROUP BY a.analysis_timestamp, a.analysis_id, bm.brand_name
ORDER BY a.analysis_timestamp
```

**Gráfico B — Evolución Posición (Line Chart)**
- **Eje X**: Fecha
- **Eje Y**: Posición promedio (invertido: bajo = mejor)
- **Serie**: Solo marca target

```sql
SELECT
  a.analysis_timestamp,
  ROUND(AVG(bm.appearance_order), 1) AS avg_position
FROM `seo_ias.brand_mentions` bm
JOIN `seo_ias.analyses` a ON bm.analysis_id = a.analysis_id
WHERE bm.is_target = TRUE AND bm.mentioned = TRUE AND bm.appearance_order > 0
  AND bm.project_name = @project_name
GROUP BY a.analysis_timestamp
ORDER BY a.analysis_timestamp
```

**Gráfico C — Evolución Sentimiento (Line Chart)**
- **Eje X**: Fecha
- **Eje Y**: Sentimiento neto (-2 a +2)
- **Serie**: Solo marca target

```sql
SELECT
  a.analysis_timestamp,
  ROUND(AVG(CASE bm.sentiment
    WHEN 'very_positive' THEN 2 WHEN 'positive' THEN 1
    WHEN 'neutral' THEN 0 WHEN 'negative' THEN -1
    WHEN 'very_negative' THEN -2 ELSE 0
  END), 2) AS net_sentiment
FROM `seo_ias.brand_mentions` bm
JOIN `seo_ias.analyses` a ON bm.analysis_id = a.analysis_id
WHERE bm.is_target = TRUE AND bm.mentioned = TRUE
  AND bm.project_name = @project_name
GROUP BY a.analysis_timestamp
ORDER BY a.analysis_timestamp
```

---

## DASHBOARD 2: AI Overviews (Search Visibility)

> Replica la pestaña "AI Overviews" del Intelligence Hub.
> **Tabla principal**: `ai_overview_sov`
> **Tablas auxiliares**: `ai_overview_gaps`, `ai_overview_top_pages`

### 2.1 KPI Cards (fila superior)

**SoV por Cantidad de Keywords (%)**
```sql
SELECT
  ROUND(keywords_count * 100.0 / SUM(keywords_count) OVER(), 1) AS sov_by_count
FROM `seo_ias.ai_overview_sov`
WHERE analysis_id = @latest_analysis_id AND is_target = TRUE
```

**SoV por Volumen de Búsqueda (%)**
```sql
SELECT
  ROUND(total_estimated_volume * 100.0 /
    SUM(total_estimated_volume) OVER(), 1) AS sov_by_volume
FROM `seo_ias.ai_overview_sov`
WHERE analysis_id = @latest_analysis_id AND is_target = TRUE
```

**Total Keywords Únicas**
```sql
SELECT SUM(keywords_count) AS total_keywords
FROM `seo_ias.ai_overview_sov`
WHERE analysis_id = @latest_analysis_id
```

---

### 2.2 Tabla Share of Voice Detallada

| Dominio | Keywords | SoV Count % | Volumen | SoV Vol % |
|---------|----------|-------------|---------|-----------|
| target.com | 45 | 28.5% | 125,000 | 32.1% |
| competitor.com | 38 | 24.1% | 98,000 | 25.2% |

```sql
SELECT
  domain,
  is_target,
  keywords_count,
  ROUND(keywords_count * 100.0 / SUM(keywords_count) OVER(), 1) AS sov_count_pct,
  total_estimated_volume,
  ROUND(total_estimated_volume * 100.0 /
    NULLIF(SUM(total_estimated_volume) OVER(), 0), 1) AS sov_volume_pct
FROM `seo_ias.ai_overview_sov`
WHERE analysis_id = @latest_analysis_id
ORDER BY keywords_count DESC
```

---

### 2.3 Distribución por Intención de Búsqueda (Stacked Bar Chart)

- **Tipo**: Barras apiladas por dominio
- **Eje X**: Dominio
- **Eje Y**: Cantidad de keywords
- **Segmentos** (colores):
  - Informational (azul)
  - Commercial (naranja)
  - Transactional (verde)
  - Navigational (morado)

```sql
SELECT
  domain,
  intent_informational,
  intent_commercial,
  intent_transactional,
  intent_navigational
FROM `seo_ias.ai_overview_sov`
WHERE analysis_id = @latest_analysis_id
ORDER BY keywords_count DESC
```

---

### 2.4 Distribución de Volumen por Dominio (Bar Chart)

- **Tipo**: Barras verticales
- **Eje X**: Dominio
- **Eje Y**: Volumen total estimado
- **Color**: Highlight en azul para target, gris para competidores

```sql
SELECT domain, is_target, total_estimated_volume
FROM `seo_ias.ai_overview_sov`
WHERE analysis_id = @latest_analysis_id
ORDER BY total_estimated_volume DESC
```

---

### 2.5 Gap Analysis — Oportunidades (Tabla)

> Keywords donde los competidores aparecen en AI Overviews pero el target NO.

| Keyword | Volumen | Competidor |
|---------|---------|------------|
| "mejores bancos ecuador" | 12,000 | competitor.com |

```sql
SELECT keyword, search_volume, competitor_domain
FROM `seo_ias.ai_overview_gaps`
WHERE analysis_id = @latest_analysis_id
ORDER BY search_volume DESC
LIMIT 20
```

---

### 2.6 Top Páginas Citadas (Tabla)

| Dominio | URL | Keywords |
|---------|-----|----------|
| target.com | /productos/cuenta | 12 |

```sql
SELECT domain, is_target, url, keyword_count
FROM `seo_ias.ai_overview_top_pages`
WHERE analysis_id = @latest_analysis_id
ORDER BY keyword_count DESC
LIMIT 20
```

---

### 2.7 Evolución Histórica AI Overviews (3 líneas)

> Requiere **2+ análisis AI Overview** del mismo proyecto.

**Gráfico A — SoV por Volumen en el tiempo (Line)**
```sql
SELECT analysis_timestamp,
  ROUND(total_estimated_volume * 100.0 /
    SUM(total_estimated_volume) OVER(PARTITION BY analysis_id), 1) AS sov_pct
FROM `seo_ias.ai_overview_sov`
WHERE is_target = TRUE AND project_name = @project_name
ORDER BY analysis_timestamp
```

**Gráfico B — Keywords donde apareces (Line)**
```sql
SELECT analysis_timestamp, keywords_count
FROM `seo_ias.ai_overview_sov`
WHERE is_target = TRUE AND project_name = @project_name
ORDER BY analysis_timestamp
```

**Gráfico C — Volumen total capturado (Line)**
```sql
SELECT analysis_timestamp, total_estimated_volume
FROM `seo_ias.ai_overview_sov`
WHERE is_target = TRUE AND project_name = @project_name
ORDER BY analysis_timestamp
```

---

## Filtros Globales (aplicar en todos los dashboards)

| Filtro | Campo | Tipo |
|--------|-------|------|
| **Cliente** | `client_name` | Dropdown |
| **Proyecto** | `project_name` | Dropdown (depende de cliente) |
| **Fecha** | `analysis_timestamp` | Date range picker |
| **Análisis específico** | `analysis_id` | Dropdown (para ver uno concreto) |

---

## Paleta de Colores

| Uso | Color | Hex |
|-----|-------|-----|
| Marca target | Azul | #3b82f6 |
| Competidores | Gris | #9ca3af |
| Positivo / éxito | Verde | #10b981 |
| Negativo / alerta | Rojo | #ef4444 |
| Sentimiento neutro | Amarillo | #f59e0b |
| Confianza | Cyan | #06b6d4 |
| Posición | Morado | #a855f7 |
| Informational | Azul | #3b82f6 |
| Commercial | Naranja | #f97316 |
| Transactional | Verde | #10b981 |
| Navigational | Morado | #a855f7 |

---

## Mapeo de Sentimiento

Los datos de sentimiento se almacenan como texto. Para cálculos numéricos:

| Texto | Valor numérico | Color |
|-------|---------------|-------|
| `very_positive` | +2 | #059669 (verde oscuro) |
| `positive` | +1 | #10b981 (verde) |
| `neutral` | 0 | #f59e0b (amarillo) |
| `negative` | -1 | #ef4444 (rojo) |
| `very_negative` | -2 | #dc2626 (rojo oscuro) |

---

## Notas Técnicas

- Todas las tablas están **particionadas por `analysis_timestamp`** (partición diaria)
- Para obtener el "último análisis" de un proyecto: `ORDER BY analysis_timestamp DESC LIMIT 1`
- Los campos `is_target` permiten separar fácilmente la marca objetivo de competidores
- Los campos `is_discovered` identifican marcas encontradas por la IA que no estaban configuradas
- El campo `evidence` en brand_mentions contiene el texto de contexto donde se encontró la mención
- Un mismo `client_name` puede tener múltiples `project_name` (ej: "Marca" y "Genérico")
