# Alcance de la Comparativa de Menciones de Marca

## Resumen

La **comparativa inicial** y el **resumen consolidado** de menciones de marca incluyen **TODAS las preguntas** del análisis, tanto preguntas genéricas como preguntas específicas de marca.

## Cómo funciona

### 1. Consolidación de Menciones

Cuando se ejecuta un análisis, el sistema:

1. Analiza cada pregunta individualmente
2. Identifica las menciones de marca en cada respuesta generada por la IA
3. **Consolida todas las menciones** sumando las frecuencias de todas las preguntas

### 2. Ejemplo Práctico

Supongamos un análisis con las siguientes preguntas:

#### Preguntas Genéricas:
- "¿Cuáles son las mejores aseguradoras de hogar en España?"
  - Menciones: Mapfre (3 veces), Allianz (2 veces), Occident (1 vez)

- "¿Qué aseguradora tiene mejor atención al cliente?"
  - Menciones: Mapfre (2 veces), AXA (1 vez)

#### Preguntas Específicas de Marca:
- "¿Occident es una buena aseguradora?"
  - Menciones: Occident (5 veces), Mapfre (1 vez)

#### Resultado Consolidado:
- **Mapfre**: 6 menciones totales (3 + 2 + 1)
- **Occident**: 6 menciones totales (1 + 5)
- **Allianz**: 2 menciones totales (2)
- **AXA**: 1 mención total (1)

## Ventajas de este Enfoque

### 1. Visión Global
Permite tener una visión completa de la presencia de cada marca en todo el conjunto de respuestas generadas por la IA, sin importar el tipo de pregunta.

### 2. Comparación Justa
Todas las marcas son evaluadas bajo el mismo criterio: su frecuencia de aparición en el conjunto total de respuestas.

### 3. Detección de Patrones
Facilita identificar qué marcas aparecen con más frecuencia en las respuestas de la IA, independientemente del contexto de la pregunta.

## Análisis por Pregunta

Aunque la comparativa consolida todas las menciones, el informe detallado muestra:

- **Por pregunta**: Qué marcas se mencionaron en cada pregunta específica
- **Categoría**: A qué categoría pertenece cada pregunta
- **Contexto**: Sentimiento (positivo/negativo/neutral) de cada mención
- **Evidencia**: Fragmentos de texto donde se menciona cada marca

## Informes Disponibles

### 1. Informe Markdown
- Resumen ejecutivo consolidado
- Sección de marcas objetivo con frecuencias totales
- Análisis detallado por pregunta
- Menciones específicas en cada pregunta

### 2. Informe JSON
- Estructura completa con todas las menciones
- Métricas consolidadas
- Análisis detallado por pregunta con brandMentions individuales

### 3. Informe Tabla (CSV)
- Vista en tabla con columnas:
  - Pregunta
  - Categoría
  - Marcas Mencionadas (con sentimiento)
  - Confianza (%)
  - Sentimiento General

## Código Relevante

Las funciones que realizan la consolidación están en:
- `api/services/openaiService.ts`
  - `consolidateBrandMentionsWithConfiguration()` (línea ~1046)
  - `consolidateBrandMentions()` (línea ~1080)

## Preguntas Frecuentes

### ¿Por qué se incluyen las preguntas específicas de marca?

Porque el objetivo es medir la **presencia total** de cada marca en las respuestas de la IA. Las preguntas específicas de marca también son consultas que los usuarios reales podrían hacer, y es importante saber qué otras marcas aparecen en esas respuestas.

### ¿Puedo ver las menciones solo de preguntas genéricas?

Actualmente, la comparativa consolida todas las preguntas. Sin embargo, puedes consultar el análisis detallado por pregunta en el informe Markdown o JSON para ver menciones específicas de cada pregunta.

### ¿Cómo afecta esto a la interpretación de los resultados?

- **Frecuencias altas** no necesariamente indican superioridad, sino mayor visibilidad en las respuestas de la IA
- Es importante revisar el **contexto** (positivo/negativo/neutral) de cada mención
- Las **preguntas específicas de marca** naturalmente aumentarán la frecuencia de esa marca, lo cual es esperado

## Actualización: Separación de Datos por Sector

A partir de las últimas mejoras, el sistema garantiza que:

1. **No hay contaminación cruzada**: Los informes de educación solo muestran datos de educación, los de seguros solo datos de seguros, etc.
2. **Marcas dinámicas**: Las marcas objetivo se muestran dinámicamente según la configuración usada
3. **Industria específica**: Los prompts de IA se adaptan al sector correspondiente

---

**Última actualización**: 2025-01-26
**Versión del documento**: 1.0
