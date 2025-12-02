# Plan de Mejoras - Dashboard y Lógica del Sistema

## 📊 ESTADO ACTUAL

### Dashboard Actual
- ✅ Métricas básicas (Total análisis, marcas, tiempo promedio, tasa éxito)
- ✅ Gráfico de líneas (tendencias mensuales)
- ✅ Gráfico de pastel (categorías)
- ✅ Tabla de análisis recientes
- ✅ Filtros por período (semana/mes/trimestre)

### Páginas Actuales
1. Dashboard - Métricas generales
2. Analysis - Ejecutar análisis
3. Reports - Ver informes guardados
4. Configuration - Configurar análisis
5. Import - Importar desde Excel
6. History - Historial

### Limitaciones Identificadas
- ❌ No hay visualización de menciones de marca en el dashboard
- ❌ Falta análisis comparativo visual entre marcas
- ❌ No se visualizan tendencias de sentimiento
- ❌ Faltan insights automáticos basados en IA
- ❌ No hay drill-down en los datos
- ❌ Falta exportación masiva o programada
- ❌ No hay alertas o notificaciones inteligentes
- ❌ Falta sistema de recomendaciones

---

## 🚀 MEJORAS PROPUESTAS

## FASE 1: MEJORAS INMEDIATAS (1-2 semanas)

### 1.1 Dashboard de Menciones de Marca

**Problema:** No hay visualización directa de cómo está posicionada tu marca vs competencia

**Solución:**
```typescript
interface BrandComparisonWidget {
  // Vista de Share of Voice
  shareOfVoice: {
    brand: string;
    percentage: number;
    mentions: number;
    trend: 'up' | 'down' | 'stable';
  }[];

  // Mapa de calor de sentimiento
  sentimentHeatmap: {
    brand: string;
    positive: number;
    neutral: number;
    negative: number;
  }[];
}
```

**Componente Visual:**
- Gráfico de barras apiladas (menciones por marca + sentimiento)
- Gauge chart para Share of Voice de marca objetivo
- Heat map de sentimiento por marca
- Tendencias vs período anterior (↑15% vs mes pasado)

### 1.2 Panel de Insights Automáticos

**Problema:** Los usuarios tienen que interpretar los datos manualmente

**Solución:** IA genera insights automáticamente

```typescript
interface AutoInsight {
  type: 'positive' | 'warning' | 'alert' | 'info';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  data: any;
  action?: {
    label: string;
    link: string;
  };
}

// Ejemplos de insights:
const insights: AutoInsight[] = [
  {
    type: 'positive',
    priority: 'high',
    title: 'Tu marca está ganando terreno',
    description: 'Occident ha incrementado su share of voice 23% este mes, superando a Allianz',
    data: { current: 0.35, previous: 0.28 },
    action: { label: 'Ver detalles', link: '/reports' }
  },
  {
    type: 'alert',
    priority: 'high',
    title: 'Sentimiento negativo en aumento',
    description: 'Detección de 45% más menciones negativas en la categoría "Atención al cliente"',
    data: { category: 'Atención al cliente', change: 0.45 }
  }
];
```

**Ubicación:** Panel superior del dashboard, rotando o mostrando los 3 más importantes

### 1.3 Comparador de Análisis

**Problema:** No puedes comparar dos análisis diferentes directamente

**Solución:**
```typescript
// Nuevo componente: AnalysisComparator
interface ComparisonData {
  analysis1: AnalysisResult;
  analysis2: AnalysisResult;
  diff: {
    mentions: { brand: string; diff: number }[];
    sentiment: { brand: string; before: number; after: number }[];
    shareOfVoice: { brand: string; change: number }[];
  };
}
```

**Vista:**
- Side-by-side comparison
- Gráficos de diferencia (delta)
- Highlights automáticos de cambios significativos

### 1.4 Filtros Avanzados en Reports

**Actualización actual:**
```typescript
// ACTUAL (básico)
interface FilterOptions {
  brand: string;
  template: string;
  dateFrom: string;
  dateTo: string;
  status: string;
}

// MEJORADO (avanzado)
interface AdvancedFilterOptions extends FilterOptions {
  // Filtros de métricas
  minConfidence: number;      // Ej: solo análisis con >80% confianza
  maxConfidence: number;
  minMentions: number;         // Ej: solo si marca tiene >5 menciones

  // Filtros de sentimiento
  sentimentFilter: 'all' | 'positive' | 'neutral' | 'negative';

  // Filtros de comparativa
  topPerforming: boolean;      // Solo los mejores performing
  underPerforming: boolean;    // Solo los que necesitan atención

  // Filtros de contenido
  hasSpecificBrand: string[];  // Solo análisis que mencionan estas marcas
  category: string[];          // Filtrar por categoría de pregunta

  // Ordenamiento
  sortBy: 'date' | 'confidence' | 'mentions' | 'sentiment';
  sortOrder: 'asc' | 'desc';
}
```

---

## FASE 2: MEJORAS AVANZADAS (2-4 semanas)

### 2.1 Dashboard Personalizable

**Concepto:** Cada usuario puede configurar su dashboard

```typescript
interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'insights' | 'comparison';
  title: string;
  size: 'small' | 'medium' | 'large';
  position: { x: number; y: number };
  config: any;
}

interface UserDashboard {
  userId: string;
  widgets: DashboardWidget[];
  layout: 'grid' | 'list';
}
```

**Implementación:**
- Drag & drop widgets (react-grid-layout)
- Guardar configuración en localStorage o DB
- Widgets disponibles:
  - KPI Cards (personalizables)
  - Gráficos (barras, líneas, pastel, radar)
  - Tablas de datos
  - Insights automáticos
  - Comparadores
  - Alertas

### 2.2 Análisis Predictivo

**Problema:** Solo ves datos históricos, no proyecciones

**Solución:**
```typescript
interface PredictiveAnalysis {
  prediction: {
    nextMonth: {
      expectedMentions: number;
      confidence: number;
      trend: 'increasing' | 'decreasing' | 'stable';
    };

    sentimentForecast: {
      date: string;
      positive: number;
      neutral: number;
      negative: number;
    }[];

    recommendations: {
      action: string;
      impact: 'high' | 'medium' | 'low';
      reasoning: string;
    }[];
  };
}
```

**Implementación:**
- Usar series temporales para predecir tendencias
- Algoritmos simples (regresión lineal, media móvil)
- Mostrar con intervalo de confianza

### 2.3 Sistema de Alertas Inteligente

```typescript
interface AlertRule {
  id: string;
  name: string;
  trigger: {
    type: 'mention_threshold' | 'sentiment_change' | 'competitor_surge' | 'custom';
    condition: {
      metric: string;
      operator: '>' | '<' | '==' | 'change_%';
      value: number;
    };
  };
  actions: {
    email?: { to: string[]; template: string };
    slack?: { webhook: string; channel: string };
    inApp: boolean;
  };
  frequency: 'realtime' | 'daily' | 'weekly';
}

// Ejemplo de alerta:
const alertExample: AlertRule = {
  id: 'alert_1',
  name: 'Caída de menciones significativa',
  trigger: {
    type: 'mention_threshold',
    condition: {
      metric: 'brand_mentions',
      operator: '<',
      value: 5  // Menos de 5 menciones
    }
  },
  actions: {
    email: { to: ['marketing@company.com'], template: 'mention_drop' },
    inApp: true
  },
  frequency: 'daily'
};
```

### 2.4 Exportación Avanzada

**Actual:** Solo exportar informes individuales

**Mejorado:**
```typescript
interface BulkExport {
  type: 'bulk';
  filters: AdvancedFilterOptions;
  format: 'csv' | 'xlsx' | 'pdf' | 'pptx';
  template?: string; // Plantilla personalizada
  schedule?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    time: string; // HH:mm
    recipients: string[];
  };
}

// Funcionalidades:
// 1. Exportar múltiples análisis a un Excel con sheets
// 2. Generar presentación PowerPoint automática
// 3. Programar envíos recurrentes
// 4. Templates personalizables (branding)
```

---

## FASE 3: OPTIMIZACIONES DE LÓGICA

### 3.1 Cache Multinivel

**Problema:** Algunas consultas se repiten frecuentemente

**Solución:**
```typescript
class CacheStrategy {
  // Nivel 1: In-Memory (Redis)
  private redis: RedisClient;

  // Nivel 2: Database cache
  private db: DatabaseCache;

  // Nivel 3: CDN para assets estáticos

  async get(key: string): Promise<any> {
    // Try L1 (fastest)
    let value = await this.redis.get(key);
    if (value) return value;

    // Try L2
    value = await this.db.get(key);
    if (value) {
      // Promote to L1
      await this.redis.set(key, value, 'EX', 3600);
      return value;
    }

    return null;
  }
}

// Cachear:
// - Análisis históricos (inmutables)
// - Configuraciones de template
// - Resultados de agregaciones comunes
// - Respuestas de IA ya generadas
```

### 3.2 Procesamiento por Lotes Optimizado

**Problema:** Procesar 100 preguntas una por una es lento

**Solución:**
```typescript
class BatchProcessor {
  async processIntelligentBatches(questions: Question[]) {
    // 1. Agrupar preguntas similares
    const batches = this.groupSimilarQuestions(questions);

    // 2. Procesar cada batch
    const results = await Promise.all(
      batches.map(batch => this.processBatch(batch))
    );

    // 3. Merge results
    return this.mergeResults(results);
  }

  private groupSimilarQuestions(questions: Question[]): Question[][] {
    // Agrupar por:
    // - Mismo contexto (mismo sector)
    // - Mismas marcas mencionadas
    // - Similar longitud
    // Beneficio: Reusar contexto entre preguntas similares
  }
}
```

### 3.3 Deduplicación Inteligente

**Problema:** A veces se analizan preguntas muy similares

**Solución:**
```typescript
class QuestionDeduplicator {
  async findDuplicates(newQuestion: string, threshold: number = 0.85): Promise<CachedResult | null> {
    // 1. Generar embedding de la pregunta
    const embedding = await this.generateEmbedding(newQuestion);

    // 2. Buscar en vector database (Pinecone, Weaviate, etc.)
    const similar = await this.vectorDB.search(embedding, {
      topK: 1,
      threshold
    });

    // 3. Si hay match > threshold, reusar resultado
    if (similar.length > 0 && similar[0].score > threshold) {
      console.log(`💾 Reusando resultado de pregunta similar (${similar[0].score.toFixed(2)} similitud)`);
      return similar[0].result;
    }

    return null;
  }
}
```

### 3.4 Análisis Incremental

**Problema:** Re-analizar todo cuando solo cambió una pregunta

**Solución:**
```typescript
interface IncrementalAnalysis {
  baseAnalysisId: string;
  changedQuestions: string[];
  preservedResults: QuestionAnalysis[];
  newResults: QuestionAnalysis[];

  async update(): Promise<AnalysisResult> {
    // Solo re-analizar lo que cambió
    const updates = await this.analyzeChanges();

    // Merge con resultados preservados
    return this.mergeWithBase(updates);
  }
}
```

---

## FASE 4: FEATURES AVANZADAS

### 4.1 Dashboard de Competencia

```typescript
interface CompetitorDashboard {
  mainBrand: string;
  competitors: CompetitorAnalysis[];

  // Vista comparativa
  comparison: {
    metric: string;
    data: { brand: string; value: number }[];
  }[];

  // Radar chart de características
  radarData: {
    dimensions: string[]; // ['Precio', 'Servicio', 'Confianza', 'Innovación']
    brands: {
      name: string;
      scores: number[];
    }[];
  };

  // Gap analysis
  gaps: {
    dimension: string;
    yourScore: number;
    competitorAvg: number;
    gap: number;
    priority: 'high' | 'medium' | 'low';
  }[];
}
```

**Visualización:**
- Radar chart multi-marca
- Heat map de fortalezas/debilidades
- Matriz de posicionamiento (2x2)
- Timeline de cambios competitivos

### 4.2 Natural Language Queries

**Concepto:** Hacer preguntas en lenguaje natural al dashboard

```typescript
interface NLQuery {
  query: string; // "¿Cómo ha cambiado el sentimiento de Mapfre este mes?"

  parse(): {
    intent: 'comparison' | 'trend' | 'ranking' | 'detail';
    entities: {
      brand?: string[];
      metric?: string[];
      timeRange?: { from: Date; to: Date };
    };
    visualization: 'table' | 'chart' | 'text';
  };

  execute(): Promise<QueryResult>;
}

// Ejemplos de queries:
// "Muéstrame las 5 marcas más mencionadas esta semana"
// "Compara el sentimiento de Occident vs Mapfre en febrero"
// "¿Cuándo fue la última vez que tuvimos <10 menciones?"
// "Genera un resumen de los últimos 10 análisis"
```

### 4.3 Reportes Narrativos Automáticos

**Concepto:** Generar resúmenes ejecutivos en lenguaje natural

```typescript
interface NarrativeReport {
  generate(analysis: AnalysisResult): string {
    // Usar GPT-4 para generar narrativa
    const prompt = `
    Genera un resumen ejecutivo profesional basado en estos datos:

    Marca objetivo: ${analysis.brand}
    Menciones totales: ${analysis.totalMentions}
    Share of Voice: ${analysis.shareOfVoice}%
    Sentimiento: ${analysis.sentiment}

    Top 3 insights:
    ${analysis.insights.slice(0, 3).join('\n')}
    `;

    return await gpt4.complete(prompt);
  }
}

// Output ejemplo:
/*
"Este mes, Occident ha mostrado un desempeño sólido con 127 menciones,
representando el 23% del share of voice en el sector asegurador español.

El sentimiento general es positivo (65%), destacando especialmente en las
categorías de 'Innovación' y 'Atención al cliente'.

Sin embargo, se detecta un área de oportunidad en 'Precio', donde Mapfre
lidera con un 35% de menciones positivas frente a nuestro 18%.

Recomendación: Intensificar comunicación sobre competitividad de precios."
*/
```

### 4.4 Integración con Herramientas Externas

```typescript
interface ExternalIntegrations {
  // Google Analytics
  syncWithGA(config: {
    propertyId: string;
    metrics: string[];
  }): Promise<void>;

  // CRM (Salesforce, HubSpot)
  syncWithCRM(config: {
    platform: 'salesforce' | 'hubspot';
    fields: string[];
  }): Promise<void>;

  // BI Tools (Tableau, Power BI)
  exportToBI(config: {
    platform: 'tableau' | 'powerbi';
    connection: string;
  }): Promise<void>;

  // Slack/Teams
  postToSlack(webhook: string, message: SlackMessage): Promise<void>;
}
```

---

## VISUALIZACIONES NUEVAS SUGERIDAS

### 1. Sankey Diagram
**Uso:** Flujo de sentimiento de marca objetivo
```
Menciones Totales (100)
  ├─> Positivas (65) ─> Categoría Servicio (40)
  │                  └> Categoría Precio (25)
  ├─> Neutrales (25) ─> ...
  └─> Negativas (10) ─> ...
```

### 2. Treemap
**Uso:** Share of voice jerárquico
```
+------------------+
| Mapfre (35%)     |
+--------+---------+
| Allianz| Occident|
| (20%)  | (15%)   |
+--------+---------+
| ...otros...      |
+------------------+
```

### 3. Gantt Chart
**Uso:** Timeline de análisis y campañas
```
Ene  Feb  Mar  Abr
|====|====|====|
  A1   A2   A3   <- Análisis
    [Campaña X]   <- Eventos importantes
```

### 4. Network Graph
**Uso:** Co-menciones de marcas
```
    Mapfre
    /  |  \
   /   |   \
Allianz-+-Occident
         |
        AXA
```

### 5. Sparklines
**Uso:** Micro-trends en cards de métricas
```
Menciones: 127 ▁▂▃▅▇▅▃
Sentimiento: 65% ▃▄▅▅▄▃▂
```

---

## PRIORIZACIÓN RECOMENDADA

### 🔥 Prioridad ALTA (Hacer YA)
1. Panel de Insights Automáticos
2. Dashboard de Menciones de Marca
3. Filtros Avanzados
4. Exportación a Excel mejorada

### ⚡ Prioridad MEDIA (Próximas 2-4 semanas)
5. Comparador de Análisis
6. Sistema de Alertas
7. Dashboard Personalizable
8. Cache Multinivel

### 💡 Prioridad BAJA (Futuro)
9. Análisis Predictivo
10. Natural Language Queries
11. Reportes Narrativos
12. Integraciones Externas

---

## MÉTRICAS DE ÉXITO

Para medir si las mejoras funcionan:

```typescript
interface SuccessMetrics {
  // UX
  timeToInsight: number;          // Tiempo hasta encontrar un insight útil
  userSatisfaction: number;        // NPS o rating
  featureAdoption: {               // % usuarios usando cada feature
    [feature: string]: number;
  };

  // Performance
  dashboardLoadTime: number;       // <3s objetivo
  queryResponseTime: number;       // <1s objetivo
  cacheHitRate: number;           // >70% objetivo

  // Business
  analysisFrequency: number;       // Análisis por usuario/mes
  reportExports: number;           // Exportaciones por mes
  alertsTriggered: number;        // Alertas útiles disparadas
}
```

---

## STACK TECNOLÓGICO SUGERIDO

### Frontend
```typescript
// Visualizaciones
- Recharts (actual) ✅
- D3.js (para visualizaciones custom)
- Nivo (alternativa moderna a Recharts)
- React-Grid-Layout (dashboards personalizables)

// UI Components
- Headless UI (actual) ✅
- Radix UI (componentes accesibles)
- shadcn/ui (componentes modernos)

// Estado
- Zustand o Jotai (estado global ligero)
- React Query (cache y sincronización)
```

### Backend
```typescript
// Cache
- Redis (cache distribuido)
- Node-cache (cache en memoria)

// Jobs
- Bull (queue de trabajos)
- node-cron (tareas programadas)

// Analytics
- Agregaciones en MongoDB
- Materialized views para queries comunes
```

---

**Última actualización:** 2025-01-26
**Versión:** 1.0 - Plan Inicial de Mejoras
