# Dinamica de Prompts - Mediciones IA

Documentacion tecnica sobre todos los prompts del sistema, donde se encuentran y como modificarlos.

**Archivo principal:** `api/services/openaiService.ts`

---

## Indice de Prompts

| # | Nombre | Lineas | Metodo | Modelo |
|---|--------|--------|--------|--------|
| 1 | Busqueda web (multi-modelo) | ~2306-2310 | `analyzeWithAIPersona()` | gpt-4o-search-preview |
| 2 | Analisis de marcas (multi-modelo) | ~2335-2367 | `analyzeWithAIPersona()` | gpt-4o-mini |
| 3 | Busqueda web (estandar) | ~537-553 | `generateWithOpenAI()` | Dinamico (search) |
| 4 | Analisis generativo de marcas | ~899-953 | `buildGenerativeAnalysisPrompt()` | gpt-4o-mini |
| 5 | System message base | ~706-714 | `buildSystemMessage()` | N/A |
| 6 | Prompt de analisis legacy | ~851-893 | `buildAnalysisPromptWithConfiguration()` | gpt-4o-mini |

---

## Prompt 1: Busqueda web (multi-modelo)

**Ubicacion:** `api/services/openaiService.ts` → metodo `analyzeWithAIPersona()` (~linea 2306)
**Modelo:** `gpt-4o-search-preview` (con `web_search_options`)
**Cuando se usa:** Analisis multi-modelo (flujo principal cuando el usuario lanza un analisis)

### System prompt

```
Responde siempre en ${countryLanguage}. Contexto geográfico: ${countryName}.
```

**Variables:**
- `countryLanguage` → Idioma del pais seleccionado (ej: "Español", "English"). Default: "Español"
- `countryName` → Nombre del pais (ej: "España", "México"). Default: "España"

### User prompt

```
${questionData.question}

Responde de forma completa y útil, enfocándote en ${countryName}.
```

**Variables:**
- `questionData.question` → La pregunta de la plantilla/configuracion
- `countryName` → Pais seleccionado

### Parametros de la llamada API

```typescript
{
  model: "gpt-4o-search-preview",
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: cleanPrompt }
  ],
  max_tokens: configuration.maxTokens || 2000,
  web_search_options: {
    search_context_size: 'medium'  // opciones: 'low' | 'medium' | 'high'
  }
}
```

---

## Prompt 2: Analisis de marcas (multi-modelo)

**Ubicacion:** `api/services/openaiService.ts` → metodo `analyzeWithAIPersona()` (~linea 2335)
**Modelo:** `gpt-4o-mini` (sin web search, economico)
**Cuando se usa:** Inmediatamente despues del Prompt 1, para extraer marcas del texto obtenido

### User prompt (sin system)

```
Analiza la siguiente respuesta de IA y extrae información sobre menciones de marcas.

CONTEXTO GEOGRÁFICO: ${countryContext} (${countryName})
IDIOMA: ${countryLanguage}

RESPUESTA A ANALIZAR:
"""
${naturalResponse}
"""

MARCA OBJETIVO: ${targetBrand}
COMPETIDORES CONOCIDOS: ${competitors.join(', ')}

Responde SOLO con JSON válido (sin texto adicional, en ${countryLanguage}):
{
  "targetBrand": {
    "name": "${targetBrand}",
    "mentioned": true/false,
    "sentiment": "very_positive|positive|neutral|negative|very_negative",
    "position": número (orden de aparición en el texto, 1=primera marca, 0=no aparece)
  },
  "otherBrands": [
    {
      "name": "NombreMarca",
      "mentioned": true,
      "sentiment": "very_positive|positive|neutral|negative|very_negative",
      "position": número
    }
  ],
  "confidence": número entre 0.7 y 0.95
}

IMPORTANTE: Detecta TODAS las marcas mencionadas, incluso las que no están en la lista de competidores. Ten en cuenta que el contexto es ${countryName} al evaluar las marcas.
```

**Variables:**
- `countryContext` → Frase de contexto (ej: "en España, considerando el mercado español"). Default: "en España, considerando el mercado español"
- `countryName` → Nombre del pais
- `countryLanguage` → Idioma
- `naturalResponse` → Texto completo devuelto por el Prompt 1
- `targetBrand` → Marca objetivo configurada por el usuario
- `competitors` → Array de competidores configurados

### Parametros de la llamada API

```typescript
{
  model: "gpt-4o-mini",
  messages: [{ role: 'user', content: analysisPrompt }],
  temperature: 0.1,
  max_tokens: 1500
}
```

---

## Prompt 3: Busqueda web (estandar)

**Ubicacion:** `api/services/openaiService.ts` → metodo `generateWithOpenAI()` (~linea 537)
**Modelo:** Dinamico (el que seleccione el usuario, debe tener "search" en el nombre)
**Cuando se usa:** Flujo estandar (no multi-modelo), llamado desde `analyzeQuestionWithConfiguration()`

### System prompt

```
País: ${countryName}. Fecha y hora actual: ${now.toLocaleString('es-ES', { timeZone, dateStyle: 'full', timeStyle: 'short' })}.
```

### User prompt

```
${question}
```

(La pregunta se envia tal cual, sin instrucciones adicionales)

### Parametros de la llamada API

```typescript
{
  model: modelId,  // ej: "gpt-4o-search-preview"
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question }
  ],
  web_search_options: {
    search_context_size: 'medium'
  }
}
```

---

## Prompt 4: Analisis generativo de marcas

**Ubicacion:** `api/services/openaiService.ts` → metodo `buildGenerativeAnalysisPrompt()` (~linea 899)
**Modelo:** `gpt-4o-mini`
**Cuando se usa:** Flujo estandar, despues del Prompt 3, para analizar menciones de marca

### User prompt (sin system)

```
Analiza el siguiente contenido generado por IA para identificar menciones de marcas ${countryContext}.

PREGUNTA ORIGINAL: "${originalQuestion}"

CONTEXTO GEOGRÁFICO: ${countryContext}
IDIOMA: ${countryLanguage}

CONTENIDO GENERADO POR IA A ANALIZAR:
"${generatedContent}"

MARCAS A BUSCAR:
- Marcas Objetivo: ${targetBrandsStr.join(', ')}
- Competidores: ${competitorBrandsStr.slice(0, 10).join(', ')}

INSTRUCCIONES:
1. Analiza ÚNICAMENTE el contenido generado por IA arriba
2. Identifica si alguna de las marcas objetivo o competidores es mencionada
3. Evalúa el contexto y sentimiento de cada mención
4. Determina la frecuencia y relevancia de cada mención
5. Proporciona evidencia textual específica de las menciones
6. Ten en cuenta el contexto geográfico (${countryContext}) al evaluar la relevancia
7. IMPORTANTE: Extrae TODAS las fuentes, referencias, estudios, sitios web, organizaciones o entidades que el LLM menciona o en las que parece basar su respuesta (ej: "según OCU", "de acuerdo con Rastreator", URLs mencionadas, estudios citados, etc.)

FORMATO JSON (responde SOLO con JSON válido, en ${countryLanguage}):
{
  "summary": "Resumen del análisis de menciones en la respuesta generativa (50-100 palabras)",
  "brandMentions": [
    {
      "brand": "Nombre de la marca",
      "mentioned": true,
      "frequency": 1,
      "context": "positive",
      "evidence": ["cita textual exacta"],
      "relevance": "high"
    }
  ],
  "sourcesCited": [
    {
      "name": "Nombre de la fuente",
      "type": "website",
      "url": null,
      "context": "Cita de cómo se referencia",
      "credibility": "medium"
    }
  ],
  "sentiment": "positive",
  "confidenceScore": 0.85
}
```

### Parametros de la llamada API

```typescript
{
  model: "gpt-4o-mini",
  messages: [{ role: 'user', content: analysisPrompt }],
  temperature: 0.1,
  max_tokens: 2500
}
```

---

## Prompt 5: System message base

**Ubicacion:** `api/services/openaiService.ts` → metodo `buildSystemMessage()` (~linea 706)
**Cuando se usa:** Metodo auxiliar disponible pero NO se usa directamente en los flujos principales actuales

```
Eres un experto en ${industry} ${countryContext}.
Responde siempre en ${countryLanguage}.
Proporciona información relevante y actualizada para ese mercado específico.
Menciona empresas, marcas y servicios que operen en ese territorio.
```

---

## Prompt 6: Prompt de analisis legacy

**Ubicacion:** `api/services/openaiService.ts` → metodo `buildAnalysisPromptWithConfiguration()` (~linea 851)
**Cuando se usa:** Flujo legacy/alternativo. Analisis sin busqueda web.

```
Analiza esta pregunta del ${industry}:

PREGUNTA: "${question}"

MARCAS: Objetivo: ${targetBrandsStr.join(', ')} | Competidores: ${competitorBrandsStr.slice(0, 5).join(', ')}

INSTRUCCIONES:
1. Análisis profesional basado en conocimiento del mercado español
2. Máximo ${maxSources} fuentes reales del sector
3. Identifica menciones de marcas objetivo y competidores
4. Evalúa sentimiento hacia cada marca

FORMATO JSON (responde SOLO con JSON válido):
{
  "summary": "Análisis ejecutivo detallado (80-150 palabras)",
  "sources": [...],
  "brandMentions": [...],
  "sentiment": "positive/negative/neutral",
  "confidenceScore": 0.75-0.95
}
```

**Nota:** Este prompt tiene hardcodeado "mercado español". Si se usa, habria que parametrizarlo con pais.

---

## Flujo de ejecucion

### Flujo multi-modelo (principal)

```
Usuario lanza analisis
    ↓
analysis.ts → POST /execute
    ↓
openaiService.executeMultiModelAnalysis()
    ↓
  Para cada pregunta (en paralelo):
    ↓
  analyzeQuestionWithMultipleModels()
    ↓
  analyzeWithAIPersona()
    ├── PROMPT 1: Busqueda web (gpt-4o-search-preview)
    │   → Obtiene texto natural + fuentes web
    ↓
    └── PROMPT 2: Analisis de marcas (gpt-4o-mini)
        → Extrae JSON con marcas, sentimiento, posicion
```

### Flujo estandar

```
Usuario lanza analisis (1 solo modelo)
    ↓
analysis.ts → POST /execute
    ↓
openaiService.executeAnalysisWithConfiguration()
    ↓
  Para cada pregunta (en paralelo con concurrencia):
    ↓
  analyzeQuestionWithConfiguration()
    ├── PROMPT 3: Busqueda web via generateWithOpenAI()
    │   → Obtiene texto + fuentes web
    ↓
    └── PROMPT 4: Analisis generativo via buildGenerativeAnalysisPrompt()
        → Extrae JSON con marcas, fuentes, sentimiento
```

---

## Variables de contexto geografico

Estas variables vienen del frontend (dropdown de pais en la pagina de Analisis) y se propagan asi:

```
Frontend (Analysis.tsx)
  → countryCode, countryName, timezone en POST body
    → analysis.ts las mete en extendedConfiguration
      → openaiService las lee de configuration.*
```

| Variable | Ejemplo ES | Ejemplo MX | Default |
|----------|-----------|-----------|---------|
| `countryCode` | "ES" | "MX" | "ES" |
| `countryName` | "España" | "México" | "España" |
| `countryLanguage` | "Español" | "Español" | "Español" |
| `countryContext` | "en España, considerando el mercado español" | "en México, considerando el mercado mexicano" | "en España, considerando el mercado español" |
| `timezone` | "Europe/Madrid" | "America/Mexico_City" | "Europe/Madrid" |

---

## Como modificar un prompt

1. Abrir `api/services/openaiService.ts`
2. Buscar el metodo correspondiente (ver tabla del indice)
3. Modificar el template string del prompt
4. Guardar → nodemon reinicia automaticamente el servidor
5. Probar un analisis desde la interfaz

### Buenas practicas

- **No quitar las variables de pais** (`countryName`, `countryLanguage`, etc.) para mantener la geolocalizacion
- **El Prompt 2 debe pedir siempre JSON valido** porque su respuesta se parsea con `JSON.parse()`
- **El Prompt 4 debe mantener la estructura JSON** porque `parseGenerativeAnalysisResponse()` espera campos especificos (`summary`, `brandMentions`, `sourcesCited`, `sentiment`, `confidenceScore`)
- **Temperature 0.1** en prompts de analisis para respuestas consistentes
- **web_search_options** solo funciona con modelos que incluyen "search" en el nombre

---

## Modelos configurados

```typescript
GENERATION_MODEL = "gpt-4o-search-preview"  // Busqueda web (Prompt 1 y 3)
ANALYSIS_MODEL = "gpt-4o-mini"              // Analisis de marcas (Prompt 2 y 4)
```

Definidos como constantes de clase en `openaiService.ts` (~linea 170-172). El modelo de generacion puede ser sobreescrito por el usuario desde el dropdown del frontend.
