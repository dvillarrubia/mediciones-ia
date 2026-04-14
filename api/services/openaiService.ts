/**
 * Servicio para integración con múltiples proveedores de IA (OpenAI, Anthropic, Google)
 */
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { TARGET_BRANDS, COMPETITOR_BRANDS, PRIORITY_SOURCES, ANALYSIS_QUESTIONS, getModelById, type QuestionCategory, type SentimentType } from '../config/constants.js';
import { cacheService } from './cacheService.js';

// Nuevos tipos para análisis más sofisticado
export type AIModelPersona = 'chatgpt' | 'claude' | 'gemini' | 'perplexity';

export type DetailedSentiment = 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';

export interface ContextualAnalysis {
  sentiment: DetailedSentiment;
  confidence: number;
  reasoning: string;
  competitivePosition: 'leader' | 'follower' | 'neutral' | 'not_mentioned';
  contextType: 'comparison' | 'standalone' | 'recommendation' | 'review' | 'news';
}

export interface MultiModelAnalysis {
  modelPersona: AIModelPersona;
  response: string;
  brandMentions: BrandMention[];
  sourcesCited?: SourceCited[];
  overallSentiment: DetailedSentiment;
  contextualAnalysis: ContextualAnalysis[];
  confidenceScore: number;
}

export interface AnalysisSource {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  isPriority: boolean;
  fullContent?: string; // Contenido completo extraído del LLM
}

export interface BrandMention {
  brand: string;
  mentioned: boolean;
  frequency: number;
  context: SentimentType;
  evidence: string[];
  // Campos para tracking de aparición y descubrimiento
  appearanceOrder?: number;      // Orden de aparición en la respuesta (1=primero)
  isDiscovered?: boolean;        // true si NO estaba en la lista configurada
  // Nuevos campos para análisis más sofisticado
  detailedSentiment?: DetailedSentiment;
  contextualAnalysis?: ContextualAnalysis;
  competitiveComparison?: {
    comparedWith: string[];
    position: 'better' | 'worse' | 'equal' | 'not_compared';
    reasoning: string;
  };
}

export interface SourceCited {
  name: string;
  type: 'website' | 'study' | 'organization' | 'media' | 'government' | 'other';
  url: string | null;
  context: string;
  credibility: 'high' | 'medium' | 'low';
}

// Fuentes web REALES extraídas de OpenAI Web Search
export interface WebSearchSource {
  url: string;
  title: string;
  snippet: string;
  startIndex?: number;
  endIndex?: number;
}

// ========== ESTRUCTURA SIMPLIFICADA DE ANÁLISIS ==========
// Esta es la estructura que el usuario realmente necesita

export interface SimpleBrandAnalysis {
  name: string;
  mentioned: boolean;
  sentiment: 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';
  position: number;  // Orden de aparición en la respuesta (1=primero, 0=no mencionado)
}

export interface SimpleQuestionAnalysis {
  questionId: string;
  question: string;
  response: string;  // Respuesta COMPLETA del LLM
  targetBrand: SimpleBrandAnalysis;  // La marca objetivo configurada
  otherBrands: SimpleBrandAnalysis[];  // Otras marcas mencionadas (competidores + descubiertas)
  sources: string[];  // Solo las URLs de las fuentes usadas
  confidence: number;  // Nivel de confianza (0-1)
}

export interface QuestionAnalysis {
  questionId: string;
  question: string;
  category: string;
  summary: string;
  sources: AnalysisSource[];
  brandMentions: BrandMention[];
  sourcesCited?: SourceCited[];  // Fuentes citadas por el LLM en su respuesta
  sentiment: SentimentType;
  confidenceScore: number;
  // Nuevos campos para análisis multi-modelo
  multiModelAnalysis?: MultiModelAnalysis[];
  detailedSentiment?: DetailedSentiment;
  contextualInsights?: string;
  competitiveAnalysis?: {
    targetBrandPosition: string;
    competitorComparisons: Array<{
      competitor: string;
      comparison: string;
      advantage: 'target' | 'competitor' | 'neutral';
    }>;
  };
}

export interface AnalysisResult {
  analysisId: string;
  timestamp: string;
  categories: QuestionCategory[];
  questions: QuestionAnalysis[];
  overallConfidence: number;
  totalSources: number;
  prioritySources: number;
  brandSummary: {
    targetBrands: BrandMention[];
    competitors: BrandMention[];
    otherCompetitors?: BrandMention[];  // Competidores descubiertos por la IA (no configurados)
  };
  // Nuevo: Comparativas separadas por tipo de pregunta
  brandSummaryByType?: {
    all: {
      targetBrands: BrandMention[];
      competitors: BrandMention[];
      otherCompetitors?: BrandMention[];
    };
    generic: {
      targetBrands: BrandMention[];
      competitors: BrandMention[];
      otherCompetitors?: BrandMention[];
    };
    specific: {
      targetBrands: BrandMention[];
      competitors: BrandMention[];
      otherCompetitors?: BrandMention[];
    };
  };
}

class OpenAIService {
  private client: OpenAI;
  private userApiKeys?: {
    openai?: string;
    anthropic?: string;
    google?: string;
  };

  // Configuración de procesamiento paralelo (OPTIMIZADO PARA VELOCIDAD)
  private readonly CONCURRENT_REQUESTS = 15; // Número de peticiones simultáneas (aumentado de 5 a 15)
  private readonly MAX_RETRIES = 2; // Intentos máximos por petición
  private readonly REQUEST_TIMEOUT = 60000; // 60 segundos
  private readonly ENABLE_CACHE = true; // Habilitar caché

  // Configuración de modelos (CON BÚSQUEDA WEB REAL)
  private readonly GENERATION_MODEL = "gpt-4o-search-preview"; // Modelo con búsqueda web para GENERAR respuestas
  private readonly ANALYSIS_MODEL = "gpt-4o-mini"; // Modelo económico para ANALIZAR menciones (no necesita web)
  private readonly DEFAULT_MODEL = "gpt-4o-search-preview"; // Modelo con búsqueda web por defecto

  // Clientes para múltiples proveedores
  private anthropicClient: Anthropic | null = null;
  private googleClient: GoogleGenAI | null = null;

  constructor(userApiKeys?: { openai?: string; anthropic?: string; google?: string }) {
    this.userApiKeys = userApiKeys;

    console.log('🔧 AIService constructor - Inicializando proveedores:');

    // OpenAI - SOLO usar key del usuario (SIN fallback a process.env)
    const openaiKey = userApiKeys?.openai;
    if (openaiKey) {
      this.client = new OpenAI({ apiKey: openaiKey });
      console.log('✅ OpenAI client initialized con key del usuario');
    } else {
      console.log('⚠️ No hay API key de OpenAI del usuario');
      this.client = null as any; // Se validará antes de usar
    }

    // Anthropic - SOLO usar key del usuario (SIN fallback a process.env)
    const anthropicKey = userApiKeys?.anthropic;
    if (anthropicKey) {
      this.anthropicClient = new Anthropic({ apiKey: anthropicKey });
      console.log('✅ Anthropic client initialized con key del usuario');
    } else {
      console.log('ℹ️ No hay API key de Anthropic del usuario');
    }

    // Google - SOLO usar key del usuario (SIN fallback a process.env)
    const googleKey = userApiKeys?.google;
    if (googleKey) {
      this.googleClient = new GoogleGenAI({ apiKey: googleKey });
      console.log('✅ Google AI client initialized con key del usuario');
    } else {
      console.log('ℹ️ No hay API key de Google del usuario');
    }

    console.log(`⚙️ Configuración: Concurrencia=${this.CONCURRENT_REQUESTS}, Cache=${this.ENABLE_CACHE}`);
    console.log(`🤖 Modelo de análisis (fase 2): ${this.ANALYSIS_MODEL} (siempre OpenAI)`);
  }

  /**
   * Procesa un array de tareas en paralelo con control de concurrencia
   */
  private async processBatch<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<R[]> {
    const results: R[] = [];
    const total = items.length;
    let completed = 0;

    console.log(`🚀 Iniciando procesamiento paralelo: ${total} tareas, concurrencia=${this.CONCURRENT_REQUESTS}`);

    // Dividir en batches
    for (let i = 0; i < items.length; i += this.CONCURRENT_REQUESTS) {
      const batch = items.slice(i, i + this.CONCURRENT_REQUESTS);

      console.log(`📦 Procesando batch ${Math.floor(i / this.CONCURRENT_REQUESTS) + 1}/${Math.ceil(total / this.CONCURRENT_REQUESTS)} (${batch.length} tareas)`);

      // Procesar batch en paralelo
      const batchPromises = batch.map((item, batchIndex) =>
        processor(item, i + batchIndex)
          .then(result => {
            completed++;
            if (onProgress) {
              onProgress(completed, total);
            }
            console.log(`✅ Tarea ${completed}/${total} completada (${((completed/total)*100).toFixed(1)}%)`);
            return result;
          })
          .catch(error => {
            completed++;
            console.error(`❌ Error en tarea ${completed}/${total}:`, error.message);
            throw error;
          })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    console.log(`🎉 Procesamiento paralelo completado: ${total} tareas finalizadas`);
    return results;
  }

  /**
   * Reintenta una operación con backoff exponencial
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries: number = this.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.warn(`⚠️ Intento ${attempt}/${maxRetries} falló para ${context}. Reintentando en ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }

  /**
   * Ejecuta análisis de marca para las categorías especificadas
   */
  async executeAnalysis(categories: QuestionCategory[], maxSources: number = 6): Promise<AnalysisResult> {
    const analysisId = `analysis_${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    // Obtener preguntas para las categorías seleccionadas
    const questionsToAnalyze = categories.flatMap(category => 
      ANALYSIS_QUESTIONS[category] || []
    );

    const questionAnalyses: QuestionAnalysis[] = [];
    
    // Procesar cada pregunta
    for (const questionData of questionsToAnalyze) {
      const analysis = await this.analyzeQuestion(questionData, maxSources);
      questionAnalyses.push(analysis);
    }

    // Calcular métricas generales
    const totalSources = questionAnalyses.reduce((sum, q) => sum + q.sources.length, 0);
    const prioritySources = questionAnalyses.reduce((sum, q) => 
      sum + q.sources.filter(s => s.isPriority).length, 0
    );
    
    const overallConfidence = questionAnalyses.reduce((sum, q) => sum + q.confidenceScore, 0) / questionAnalyses.length;

    // Consolidar menciones de marca
    const brandSummary = this.consolidateBrandMentions(questionAnalyses);

    return {
      analysisId,
      timestamp,
      categories,
      questions: questionAnalyses,
      overallConfidence,
      totalSources,
      prioritySources,
      brandSummary
    };
  }

  /**
   * Ejecuta análisis con configuración completa (nueva funcionalidad)
   */
  async executeAnalysisWithConfiguration(questions: any[], configuration: any, onProgress?: (completed: number, total: number, questionId: string) => void): Promise<AnalysisResult> {
    const startTime = Date.now();
    const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    console.log(`🚀 Iniciando análisis con ID: ${analysisId}`);
    console.log(`🚀 Iniciando análisis con configuración para ${questions.length} preguntas`);
    console.log(`⚙️ Configuración:`, {
      model: configuration.model,
      temperature: configuration.temperature,
      maxTokens: configuration.maxTokens,
      maxSources: configuration.maxSources
    });

    const errors: string[] = [];

    let results: QuestionAnalysis[] = [];

    try {
      // Usar procesamiento paralelo optimizado con control de concurrencia
      results = await this.processBatch(
        questions,
        async (question, index) => {
          const questionStartTime = Date.now();
          console.log(`📝 [${question.id}] Iniciando análisis: "${question.question.substring(0, 80)}..."`);

          try {
            // Usar retry con backoff para mayor robustez
            const result = await this.retryWithBackoff(
              () => this.analyzeQuestionWithConfiguration(question, configuration),
              `pregunta ${question.id}`,
              this.MAX_RETRIES
            );

            const questionTime = Date.now() - questionStartTime;
            console.log(`✅ [${question.id}] Completado en ${questionTime}ms`);
            return result;
          } catch (error) {
            const questionTime = Date.now() - questionStartTime;
            console.error(`❌ [${question.id}] Error después de ${questionTime}ms:`, error);
            errors.push(`Pregunta ${question.id}: ${error}`);
            return this.createErrorAnalysis(question);
          }
        },
        (completed, total) => {
          const percent = ((completed / total) * 100).toFixed(1);
          console.log(`📊 Progreso: ${completed}/${total} (${percent}%)`);
          if (onProgress) {
            onProgress(completed, total, `q_${completed}`);
          }
        }
      );

    } catch (error) {
      console.error('🔴 Error crítico durante el procesamiento paralelo:', error);
      errors.push(`Error crítico: ${error}`);
    }

    // Consolidar menciones de marca
    console.log('🔄 Consolidando menciones de marca...');
    const consolidatedMentions = this.consolidateBrandMentionsWithConfiguration(results, configuration);

    // Nuevo: Consolidar por tipo de pregunta
    const mentionsByType = this.consolidateBrandMentionsByQuestionType(results, configuration);

    const totalTime = Date.now() - startTime;
    const avgTimePerQuestion = results.length > 0 ? totalTime / results.length : 0;
    
    // Calcular estadísticas adicionales para compatibilidad con la interfaz
    const totalSources = results.reduce((sum, result) => sum + result.sources.length, 0);
    const prioritySources = results.reduce((sum, result) => sum + result.sources.filter(s => s.isPriority).length, 0);
    const overallConfidence = results.length > 0 
      ? results.reduce((sum, result) => sum + result.confidenceScore, 0) / results.length 
      : 0;
    
    console.log(`🎯 Análisis completado:`);
    console.log(`   🆔 ID de análisis: ${analysisId}`);
    console.log(`   ⏱️ Tiempo total: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
    console.log(`   📊 Preguntas procesadas: ${results.length}/${questions.length}`);
    console.log(`   ⚡ Tiempo promedio por pregunta: ${avgTimePerQuestion.toFixed(0)}ms`);
    console.log(`   ❌ Errores: ${errors.length}`);
    console.log(`   🏷️ Menciones de marca consolidadas: ${consolidatedMentions.targetBrands.length + consolidatedMentions.competitors.length}`);
    console.log(`   📈 Confianza general: ${(overallConfidence * 100).toFixed(1)}%`);
    console.log(`   📚 Total de fuentes: ${totalSources} (${prioritySources} prioritarias)`);
    
    if (errors.length > 0) {
      console.warn('⚠️ Errores durante el análisis:', errors);
    }

    return {
      analysisId,
      timestamp,
      categories: [], // Se puede agregar lógica para categorías si es necesario
      questions: results,
      overallConfidence,
      totalSources,
      prioritySources,
      brandSummary: consolidatedMentions,
      brandSummaryByType: mentionsByType
    };
  }

  /**
   * Analiza una pregunta específica usando OpenAI
   */
  private async analyzeQuestion(questionData: any, maxSources: number): Promise<QuestionAnalysis> {
    const prompt = this.buildAnalysisPrompt(questionData.question, maxSources);
    
    try {
      const completion = await this.client.chat.completions.create({
        model: this.DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content: "Experto analista de mercado. Analiza información y detecta menciones de marcas."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      const response = completion.choices[0]?.message?.content || '';
      return this.parseAnalysisResponse(questionData, response, maxSources);
      
    } catch (error) {
      console.error('Error en análisis OpenAI:', error);
      return this.createErrorAnalysis(questionData);
    }
  }

  /**
   * Obtiene el modelo de generación basado en la selección del usuario
   * IMPORTANTE: Solo permite modelos con búsqueda web
   */
  private getGenerationModel(configuration: any): string {
    const selectedModel = configuration.selectedModel;

    if (selectedModel) {
      // Verificar que el modelo tenga búsqueda web
      if (selectedModel.includes('search')) {
        console.log(`🌐 Modelo con búsqueda web seleccionado: ${selectedModel}`);
        return selectedModel;
      } else {
        console.log(`⚠️ Modelo ${selectedModel} no tiene búsqueda web, usando gpt-4o-search-preview`);
        return 'gpt-4o-search-preview';
      }
    }

    // Fallback: modelo con búsqueda web por defecto
    console.log('🌐 Usando modelo con búsqueda web por defecto: gpt-4o-search-preview');
    return 'gpt-4o-search-preview';
  }

  /**
   * Genera contenido usando el proveedor correcto según el modelo seleccionado
   * FASE 1: Usa el modelo que el usuario eligió (sin fallback)
   */
  private async generateContentWithProvider(question: string, modelId: string, configuration?: any): Promise<string> {
    const result = await this.generateContentWithProviderAndSources(question, modelId, configuration);
    return result.content;
  }

  /**
   * Genera contenido Y devuelve fuentes web - versión thread-safe para flujos paralelos
   */
  private async generateContentWithProviderAndSources(question: string, modelId: string, configuration?: any): Promise<{ content: string; webSources: WebSearchSource[] }> {
    const modelInfo = getModelById(modelId);

    if (!modelInfo) {
      throw new Error(`Modelo no encontrado: ${modelId}. Verifica que el modelo esté configurado correctamente.`);
    }

    const provider = modelInfo.provider;
    console.log(`🎯 Generando contenido con ${modelInfo.name} (${provider})`);

    switch (provider) {
      case 'openai':
        return await this.generateWithOpenAI(question, modelId, configuration);

      case 'anthropic': {
        const content = await this.generateWithAnthropic(question, modelId);
        return { content, webSources: [] };
      }

      case 'google':
        return await this.generateWithGoogle(question, modelId, configuration);

      default:
        throw new Error(`Proveedor no soportado: ${provider}`);
    }
  }

  /**
   * Genera contenido con OpenAI usando búsqueda web
   * Devuelve contenido Y fuentes web (thread-safe para ejecución paralela)
   */
  private async generateWithOpenAI(question: string, modelId: string, configuration?: any): Promise<{ content: string; webSources: WebSearchSource[] }> {
    if (!this.client) {
      throw new Error('No hay API key de OpenAI configurada. Por favor, añade tu API key de OpenAI para usar este modelo.');
    }

    // Verificar que el modelo tenga búsqueda web
    const isSearchModel = modelId.includes('search');
    if (!isSearchModel) {
      throw new Error(`El modelo ${modelId} no tiene búsqueda web. Solo se permiten modelos con búsqueda web real.`);
    }

    // Construir prompt de sistema con país y hora actual
    const countryName = configuration?.countryName || 'España';
    const now = new Date();
    const systemPrompt = `País: ${countryName}. Fecha y hora actual: ${now.toLocaleString('es-ES', {
      timeZone: configuration?.timezone || 'Europe/Madrid',
      dateStyle: 'full',
      timeStyle: 'short'
    })}.`;

    console.log(`🌐 [OpenAI] Ejecutando búsqueda web con modelo: ${modelId}`);
    console.log(`📍 [OpenAI] Sistema: ${systemPrompt}`);

    const response = await Promise.race([
      this.client.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ],
        web_search_options: {
          search_context_size: 'medium', // 'low' | 'medium' | 'high'
        },
      } as any), // TypeScript puede no tener los tipos actualizados
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: OpenAI tardó más de 90 segundos')), 90000)
      )
    ]) as any;

    const message = response.choices[0]?.message;
    const content = message?.content;

    if (!content) {
      throw new Error('OpenAI devolvió una respuesta vacía');
    }

    // Extraer fuentes web de las annotations - retorno directo, sin estado compartido
    const webSources = this.extractWebSources(message);
    console.log(`📚 [OpenAI] Fuentes web extraídas: ${webSources.length}`);

    return { content, webSources };
  }

  /**
   * Extrae las fuentes web de las annotations de OpenAI
   */
  private extractWebSources(message: any): WebSearchSource[] {
    const sources: WebSearchSource[] = [];

    // Debug: ver estructura del mensaje
    if (message) {
      const keys = Object.keys(message);
      console.log(`🔍 Estructura del mensaje: ${keys.join(', ')}`);
    }

    // OpenAI puede devolver annotations en diferentes ubicaciones
    let annotations = message?.annotations;

    // Alternativa: buscar en content si es array (nuevo formato)
    if (!annotations && Array.isArray(message?.content)) {
      for (const content of message.content) {
        if (content.annotations) {
          annotations = content.annotations;
          break;
        }
      }
    }

    if (!annotations || !Array.isArray(annotations)) {
      console.log('⚠️ No se encontraron annotations en la respuesta');
      return sources;
    }

    console.log(`📎 Encontradas ${annotations.length} annotations`);

    for (const annotation of annotations) {
      // OpenAI devuelve url_citation con datos anidados en url_citation objeto
      if (annotation.type === 'url_citation') {
        // Formato nuevo: { type: 'url_citation', url_citation: { url, title, ... } }
        const citation = annotation.url_citation || annotation;
        const url = citation.url || annotation.url;
        const title = citation.title || annotation.title;

        if (url) {
          sources.push({
            url: url,
            title: title || this.extractDomainFromUrl(url),
            snippet: annotation.text || citation.text || '',
            startIndex: citation.start_index || annotation.start_index,
            endIndex: citation.end_index || annotation.end_index,
          });
          console.log(`  📎 Fuente: ${title || url}`);
        }
      }
    }

    return sources;
  }

  /**
   * Extrae fuentes web del grounding metadata de Gemini
   */
  private extractGeminiGroundingSources(response: any): WebSearchSource[] {
    const sources: WebSearchSource[] = [];
    const metadata = response.candidates?.[0]?.groundingMetadata;

    if (!metadata?.groundingChunks) {
      console.log('⚠️ [Gemini] No se encontraron groundingChunks en respuesta');
      return sources;
    }

    const supports = metadata.groundingSupports || [];

    for (let i = 0; i < metadata.groundingChunks.length; i++) {
      const chunk = metadata.groundingChunks[i];
      if (chunk.web) {
        // Buscar el snippet correspondiente en groundingSupports
        const support = supports.find((s: any) =>
          s.groundingChunkIndices?.includes(i)
        );
        sources.push({
          url: chunk.web.uri,
          title: chunk.web.title || this.extractDomainFromUrl(chunk.web.uri),
          snippet: support?.segment?.text || '',
          startIndex: support?.segment?.startIndex,
          endIndex: support?.segment?.endIndex,
        });
      }
    }

    console.log(`📚 [Gemini] Fuentes web extraídas: ${sources.length}`);
    return sources;
  }

  /**
   * Extrae el dominio de una URL
   */
  private extractDomainFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  /**
   * Obtiene las últimas fuentes web extraídas
   */
  public getLastWebSources(): WebSearchSource[] {
    return [];
  }

  /**
   * Genera contenido con Anthropic (Claude)
   */
  private async generateWithAnthropic(question: string, modelId: string): Promise<string> {
    if (!this.anthropicClient) {
      throw new Error('No hay API key de Anthropic configurada. Por favor, añade tu API key de Anthropic para usar modelos Claude.');
    }

    const response = await Promise.race([
      this.anthropicClient.messages.create({
        model: modelId,
        max_tokens: 2000,
        messages: [{ role: 'user', content: question }],
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: Anthropic tardó más de 60 segundos')), 60000)
      )
    ]) as any;

    const content = response.content[0]?.text;
    if (!content) {
      throw new Error('Anthropic devolvió una respuesta vacía');
    }
    return content;
  }

  /**
   * Genera contenido con Google (Gemini) usando Google Search Grounding
   * Devuelve contenido Y fuentes web (thread-safe para ejecución paralela)
   */
  private async generateWithGoogle(question: string, modelId: string, configuration?: any): Promise<{ content: string; webSources: WebSearchSource[] }> {
    if (!this.googleClient) {
      throw new Error('No hay API key de Google AI configurada. Por favor, añade tu API key de Google para usar modelos Gemini.');
    }

    const countryName = configuration?.countryName || 'España';
    const now = new Date();
    const systemPrompt = `País: ${countryName}. Fecha y hora actual: ${now.toLocaleString('es-ES', {
      timeZone: configuration?.timezone || 'Europe/Madrid',
      dateStyle: 'full',
      timeStyle: 'short'
    })}.`;

    const response = await Promise.race([
      this.googleClient.models.generateContent({
        model: modelId,
        contents: `${systemPrompt}\n\n${question}`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: Google AI tardó más de 90 segundos')), 90000)
      )
    ]) as any;

    const content = response.text;
    if (!content) {
      throw new Error('Google AI devolvió una respuesta vacía');
    }

    // Extraer fuentes web del grounding metadata - retorno directo, sin estado compartido
    const webSources = this.extractGeminiGroundingSources(response);

    return { content, webSources };
  }

  /**
   * Construye el mensaje del sistema con contexto de país
   */
  private buildSystemMessage(configuration: any): string {
    const industry = configuration.industry || 'sector correspondiente';
    const countryContext = configuration.countryContext || 'en España, considerando el mercado español';
    const countryLanguage = configuration.countryLanguage || 'Español';

    return `Eres un experto en ${industry} ${countryContext}.
Responde siempre en ${countryLanguage}.
Proporciona información relevante y actualizada para ese mercado específico.
Menciona empresas, marcas y servicios que operen en ese territorio.`;
  }

  /**
   * Analiza una pregunta específica con configuración personalizada y mecanismos de recuperación
   * NUEVO ENFOQUE: Analiza respuestas generativas de ChatGPT para medir menciones de marca
   */
  private async analyzeQuestionWithConfiguration(questionData: any, configuration: any): Promise<QuestionAnalysis> {
    const questionId = questionData.id;

    // Obtener modelo dinámicamente
    const generationModel = this.getGenerationModel(configuration);

    return await this.executeWithRetry(async () => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔍 [${questionId}] INICIANDO ANÁLISIS DE RESPUESTA GENERATIVA`);
      console.log(`${'='.repeat(60)}`);
      console.log(`📝 Pregunta: "${questionData.question.substring(0, 80)}..."`);
      console.log(`🤖 MODELO GENERACIÓN (usuario eligió): ${generationModel}`);
      console.log(`💰 MODELO ANÁLISIS (económico fijo): ${this.ANALYSIS_MODEL}`);
      console.log(`🌍 País: ${configuration.countryCode || 'ES'}`);
      console.log(`${'='.repeat(60)}\n`);

      try {
        console.log(`🚀 [${questionId}] Paso 1: Generando respuesta con ${generationModel}...`);
        const startTime = Date.now();

        let generatedContent = '';
        let questionWebSources: WebSearchSource[] = [];

        // Generar clave de caché incluyendo país y modelo
        const cacheKey = `${questionData.question}_${configuration.countryCode || 'ES'}_${generationModel}`;

        // Intentar obtener del caché primero
        if (this.ENABLE_CACHE) {
          try {
            const cachedResponse = await cacheService.get(
              cacheKey,
              configuration,
              generationModel
            );

            if (cachedResponse) {
              generatedContent = cachedResponse;
              const responseTime = Date.now() - startTime;
              console.log(`💾✨ [${questionId}] Respuesta obtenida del caché en ${responseTime}ms`);
            }
          } catch (cacheError) {
            console.warn(`⚠️ [${questionId}] Error al consultar caché:`, cacheError);
            // Continuar sin caché
          }
        }

        // Si no está en caché, llamar al proveedor correspondiente
        if (!generatedContent) {
          // Usar el proveedor correcto según el modelo seleccionado (OpenAI, Anthropic, o Google)
          // IMPORTANTE: Usar la versión que devuelve fuentes directamente (thread-safe para paralelo)
          const result = await this.generateContentWithProviderAndSources(questionData.question, generationModel, configuration);
          generatedContent = result.content;
          questionWebSources = result.webSources;

          const responseTime = Date.now() - startTime;
          console.log(`📨 [${questionId}] Respuesta generativa recibida en ${responseTime}ms (${generatedContent.length} caracteres)`);

          // Guardar en caché con clave que incluye país y modelo
          if (this.ENABLE_CACHE && generatedContent) {
            try {
              await cacheService.set(
                cacheKey,
                generatedContent,
                configuration,
                generationModel,
                7 // TTL de 7 días
              );
            } catch (cacheError) {
              console.warn(`⚠️ [${questionId}] Error al guardar en caché:`, cacheError);
              // Continuar sin guardar en caché
            }
          }
        }

        console.log(`🔍 [${questionId}] Contenido generado: "${generatedContent.substring(0, 200)}..."`);

        if (!generatedContent || generatedContent.length < 50) {
          throw new Error('Respuesta generativa muy corta o vacía');
        }

        // PASO 2: Analizar la respuesta generativa para buscar menciones de marca
        console.log(`🔍 [${questionId}] Paso 2: Analizando menciones con ${this.ANALYSIS_MODEL}...`);

        const analysisPrompt = this.buildGenerativeAnalysisPrompt(questionData.question, generatedContent, configuration);

        const analysisResponse = await Promise.race([
          this.client.chat.completions.create({
            model: this.ANALYSIS_MODEL, // Usar modelo ECONÓMICO para analizar menciones (ahorro de costos)
            messages: [{ role: 'user', content: analysisPrompt }],
            temperature: 0.1, // Baja temperatura para análisis más preciso
            max_tokens: 2500,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: Analysis request took longer than 60 seconds')), 60000)
          )
        ]) as any;

        const analysisResult = analysisResponse.choices[0]?.message?.content || '';
        console.log(`📊 [${questionId}] Análisis de menciones completado (${analysisResult.length} caracteres)`);

        // Validar la respuesta del análisis
        if (!this.validateOpenAIResponse(analysisResult, questionId)) {
          throw new Error('Respuesta de análisis no válida o vacía');
        }

        const analysis = this.parseGenerativeAnalysisResponse(questionData, generatedContent, analysisResult, configuration, questionWebSources);
        console.log(`✅ [${questionId}] Análisis de respuesta generativa completado exitosamente`);
        
        return analysis;
        
      } catch (error: any) {
        console.error(`🔴 [${questionId}] Error en análisis de respuesta generativa:`, error);
        
        // Clasificar el tipo de error para mejor manejo
        if (error.message?.includes('rate_limit')) {
          console.error(`⏱️ [${questionId}] Rate limit alcanzado, reintentando...`);
          throw new Error(`Rate limit: ${error.message}`);
        } else if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
          console.error(`⏰ [${questionId}] Timeout en request, reintentando...`);
          throw new Error(`Timeout: ${error.message}`);
        } else if (error.message?.includes('insufficient_quota')) {
          console.error(`💳 [${questionId}] Cuota insuficiente en OpenAI`);
          throw new Error(`Quota exceeded: ${error.message}`);
        } else {
          console.error(`❌ [${questionId}] Error desconocido:`, error);
          throw error;
        }
      }
    }, 3, 2000, `Pregunta ${questionId}`);
  }

  /**
   * Construye el prompt optimizado para el análisis con configuración personalizada
   */
  private buildAnalysisPromptWithConfiguration(question: string, maxSources: number, configuration: any): string {
    const targetBrandsStr = configuration.targetBrands || (configuration.targetBrand ? [configuration.targetBrand] : TARGET_BRANDS);
    const competitorBrandsStr = configuration.competitorBrands || COMPETITOR_BRANDS;
    const prioritySourcesStr = configuration.prioritySources || PRIORITY_SOURCES;
    const industry = configuration.industry || 'sector correspondiente';

    // Prompt optimizado y más conciso para reducir tokens
    return `Analiza esta pregunta del ${industry}:

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
  "sources": [
    {
      "url": "URL real del sector",
      "title": "Título específico",
      "snippet": "Extracto relevante (50-100 palabras)",
      "domain": "dominio.com",
      "isPriority": ${prioritySourcesStr.includes('domain') ? 'true' : 'false'}
    }
  ],
  "brandMentions": [
    {
      "brand": "Nombre marca",
      "mentioned": true/false,
      "frequency": número,
      "context": "positive/negative/neutral",
      "evidence": ["cita específica"]
    }
  ],
  "sentiment": "positive/negative/neutral",
  "confidenceScore": 0.75-0.95
}`;
  }

  /**
   * Construye el prompt para analizar respuestas generativas en busca de menciones de marca
   */
  private buildGenerativeAnalysisPrompt(originalQuestion: string, generatedContent: string, configuration: any): string {
    const targetBrandsStr = configuration.targetBrands || (configuration.targetBrand ? [configuration.targetBrand] : TARGET_BRANDS);
    const competitorBrandsStr = configuration.competitorBrands || COMPETITOR_BRANDS;
    const countryContext = configuration.countryContext || 'en España';
    const countryLanguage = configuration.countryLanguage || 'Español';

    return `Analiza el siguiente contenido generado por IA para identificar menciones de marcas ${countryContext}.

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
}`;
  }

  /**
   * Parsea la respuesta del análisis de contenido generativo
   * ACTUALIZADO: Ahora usa fuentes web REALES de OpenAI Web Search
   */
  private parseGenerativeAnalysisResponse(questionData: any, generatedContent: string, analysisResponse: string, configuration: any, providedWebSources?: WebSearchSource[]): QuestionAnalysis {
    const questionId = questionData.id;

    console.log(`🔍 [${questionId}] Parseando respuesta de análisis generativo...`);
    console.log(`📄 [${questionId}] Respuesta a parsear (${analysisResponse.length} chars):`, analysisResponse.substring(0, 300));

    try {
      // Extraer JSON de la respuesta
      const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`❌ [${questionId}] No se encontró JSON válido en la respuesta`);
        throw new Error('No se encontró JSON válido en la respuesta de análisis');
      }

      let jsonStr = jsonMatch[0];

      // Limpiar el JSON
      jsonStr = jsonStr
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .replace(/,(\s*[}\]])/g, '$1')
        .trim();

      console.log(`🧹 [${questionId}] JSON limpiado:`, jsonStr.substring(0, 200));

      const parsedData = JSON.parse(jsonStr);
      console.log(`✅ [${questionId}] JSON parseado exitosamente`);

      // =====================================================
      // FUENTES WEB: priorizar fuentes reales del API de búsqueda,
      // si no hay (ej: caché), usar las que gpt-4o-mini extrajo del texto
      // =====================================================
      const webSources = providedWebSources && providedWebSources.length > 0
        ? providedWebSources
        : [];

      let realSources: AnalysisSource[];
      let sourcesCited: SourceCited[];

      if (webSources.length > 0) {
        // Fuentes reales del API de búsqueda web
        realSources = webSources.map((source, index) => ({
          url: source.url,
          title: source.title,
          snippet: source.snippet || `Fuente ${index + 1} de búsqueda web`,
          domain: this.extractDomainFromUrl(source.url),
          isPriority: this.isSourcePriority(source.url, configuration),
          fullContent: undefined
        }));
        console.log(`🌐 [${questionId}] ${realSources.length} FUENTES WEB REALES encontradas:`);
        realSources.forEach((s, i) => console.log(`   ${i + 1}. ${s.domain}: ${s.title}`));

        sourcesCited = realSources.map(source => ({
          name: source.title,
          type: this.classifySourceType(source.domain) as any,
          url: source.url,
          context: source.snippet,
          credibility: source.isPriority ? 'high' : 'medium' as any
        }));
      } else if (parsedData.sourcesCited && parsedData.sourcesCited.length > 0) {
        // Fallback: fuentes extraídas por gpt-4o-mini del texto (ej: respuesta cacheada)
        sourcesCited = parsedData.sourcesCited.map((source: any) => ({
          name: source.name || 'Fuente desconocida',
          type: source.type || 'website',
          url: source.url || '',
          context: source.context || '',
          credibility: source.credibility || 'medium'
        }));
        realSources = sourcesCited.map(source => ({
          url: source.url || '',
          title: source.name,
          snippet: source.context || '',
          domain: source.url ? this.extractDomainFromUrl(source.url) : 'ai-analysis',
          isPriority: source.credibility === 'high',
          fullContent: undefined
        }));
        console.log(`📝 [${questionId}] ${realSources.length} fuentes extraídas del análisis de texto`);
      } else {
        // Sin fuentes de ningún tipo
        console.log(`⚠️ [${questionId}] No se encontraron fuentes web ni en análisis de texto`);
        realSources = [];
        sourcesCited = [];
      }

      // Procesar menciones de marca
      const targetBrands = (configuration.targetBrands || (configuration.targetBrand ? [configuration.targetBrand] : [])).map((b: string) => b.toLowerCase());
      const competitorBrands = (configuration.competitorBrands || []).map((b: string) => b.toLowerCase());
      const knownBrands = new Set([...targetBrands, ...competitorBrands]);

      const brandMentions: BrandMention[] = (parsedData.brandMentions || []).map((mention: any, index: number) => {
        const brandLower = (mention.brand || '').toLowerCase();
        const isTarget = targetBrands.some((t: string) => brandLower.includes(t) || t.includes(brandLower));
        const isCompetitor = competitorBrands.some((c: string) => brandLower.includes(c) || c.includes(brandLower));
        const isDiscovered = mention.mentioned && !isTarget && !isCompetitor;

        return {
          brand: mention.brand || 'Desconocida',
          mentioned: mention.mentioned || false,
          frequency: mention.frequency || 0,
          context: mention.context || 'neutral',
          evidence: Array.isArray(mention.evidence) ? mention.evidence : [],
          appearanceOrder: mention.mentioned ? index + 1 : 0,
          isDiscovered,
          detailedSentiment: mention.context || 'neutral'
        };
      });

      const result: QuestionAnalysis = {
        questionId: questionId,
        question: questionData.question,
        category: questionData.category || 'Análisis Generativo',
        summary: parsedData.summary || 'Análisis de respuesta generativa completado',
        sources: realSources, // FUENTES WEB REALES
        brandMentions: brandMentions,
        sourcesCited: sourcesCited, // Fuentes como SourceCited para compatibilidad
        sentiment: parsedData.sentiment || 'neutral',
        confidenceScore: parsedData.confidenceScore || 0.5,
        // Guardar la respuesta generativa original para que el frontend la muestre
        multiModelAnalysis: [{
          modelPersona: 'chatgpt' as any,
          response: generatedContent,
          brandMentions: brandMentions,
          sourcesCited: sourcesCited,
          overallSentiment: parsedData.sentiment || 'neutral',
          contextualAnalysis: [],
          confidenceScore: parsedData.confidenceScore || 0.5
        }]
      };

      console.log(`✅ [${questionId}] Análisis completado: ${brandMentions.length} menciones, ${realSources.length} fuentes REALES`);
      return result;

    } catch (error) {
      console.error(`❌ [${questionId}] Error parseando análisis generativo:`, error);
      console.error(`📄 [${questionId}] Respuesta problemática:`, analysisResponse);

      return this.createErrorAnalysis(questionData);
    }
  }

  /**
   * Verifica si una fuente es prioritaria según la configuración
   */
  private isSourcePriority(url: string, configuration: any): boolean {
    const prioritySources = configuration.prioritySources || PRIORITY_SOURCES;
    const domain = this.extractDomainFromUrl(url).toLowerCase();
    return prioritySources.some((ps: string) => domain.includes(ps.toLowerCase()));
  }

  /**
   * Clasifica el tipo de fuente basado en el dominio
   */
  private classifySourceType(domain: string): string {
    const d = domain.toLowerCase();
    if (d.includes('.gov') || d.includes('.gob')) return 'government';
    if (d.includes('news') || d.includes('noticias') || d.includes('periodico')) return 'media';
    if (d.includes('edu') || d.includes('university') || d.includes('academic')) return 'study';
    if (d.includes('org')) return 'organization';
    return 'website';
  }

  /**
   * Calcula la credibilidad de una fuente basada en su URL
   */
  private calculateSourceCredibility(url: string): 'high' | 'medium' | 'low' {
    const domain = this.extractDomainFromUrl(url).toLowerCase();

    // Fuentes de alta credibilidad
    const highCredibility = ['.gov', '.gob', '.edu', 'reuters', 'bloomberg', 'bbc', 'nytimes', 'wsj', 'forbes', 'harvard', 'mit', 'stanford'];
    if (highCredibility.some(s => domain.includes(s))) return 'high';

    // Fuentes de credibilidad media
    const mediumCredibility = ['.org', 'wikipedia', 'medium', 'linkedin', 'techcrunch', 'wired', 'cnn', 'abc', 'elpais', 'elmundo'];
    if (mediumCredibility.some(s => domain.includes(s))) return 'medium';

    return 'medium'; // Por defecto, credibilidad media
  }

  /**
   * Construye el prompt de análisis
   */
  private buildAnalysisPrompt(question: string, maxSources: number): string {
    const targetBrandsStr = TARGET_BRANDS.join(', ');
    const competitorBrandsStr = COMPETITOR_BRANDS.join(', ');
    const prioritySourcesStr = PRIORITY_SOURCES.join(', ');

    return `
Eres un experto analista del sector correspondiente español. Analiza la siguiente pregunta y proporciona un análisis estructurado basado en tu conocimiento del mercado español.

PREGUNTA: "${question}"

INSTRUCCIONES:
1. Proporciona un análisis detallado y profesional sobre esta pregunta
2. Identifica y analiza menciones de estas MARCAS OBJETIVO: ${targetBrandsStr}
3. Identifica y analiza menciones de estos COMPETIDORES: ${competitorBrandsStr}
4. Incluye información relevante de fuentes confiables como: ${prioritySourcesStr}
5. Proporciona máximo ${maxSources} fuentes relevantes y reales del sector
6. Analiza el sentimiento (positivo/negativo/neutral) hacia cada marca mencionada
7. Basa tu análisis en conocimiento real del mercado español

IMPORTANTE:
- NO digas que no puedes buscar información en tiempo real
- Proporciona un análisis profesional basado en tu conocimiento del sector
- Incluye fuentes reales y relevantes del mercado español
- Genera contenido útil y específico para la pregunta planteada

FORMATO DE RESPUESTA (JSON):
{
  "summary": "Resumen ejecutivo detallado del análisis en español, mínimo 100 palabras",
  "sources": [
    {
      "url": "URL real de fuente relevante del sector",
      "title": "Título específico del artículo/página",
      "snippet": "Extracto relevante y específico",
      "domain": "dominio.com",
      "isPriority": true/false
    }
  ],
  "brandMentions": [
    {
      "brand": "Nombre exacto de la marca",
      "mentioned": true/false,
      "frequency": número_de_menciones,
      "context": "positive/negative/neutral",
      "evidence": ["cita textual específica 1", "cita textual específica 2"]
    }
  ],
  "sentiment": "positive/negative/neutral",
  "confidenceScore": 0.7-0.95
}

Responde ÚNICAMENTE con el JSON válido, sin texto adicional.
    `;
  }

  /**
   * Parsea la respuesta de OpenAI con configuración personalizada
   */
  private parseAnalysisResponseWithConfiguration(questionData: any, response: string, maxSources: number, configuration: any): QuestionAnalysis {
    try {
      console.log(`🔍 [${questionData.id}] Iniciando parseo de respuesta OpenAI (${response.length} caracteres)`);
      
      // Limpiar la respuesta para extraer solo el JSON
      let cleanedResponse = response.trim();
      
      // Buscar el JSON entre ```json y ``` si existe
      const jsonCodeBlockMatch = cleanedResponse.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonCodeBlockMatch) {
        cleanedResponse = jsonCodeBlockMatch[1].trim();
        console.log(`📦 [${questionData.id}] JSON extraído de bloque de código`);
      }
      
      // Buscar el JSON principal
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`❌ [${questionData.id}] No se encontró JSON válido en la respuesta`);
        console.error(`📄 Respuesta completa:`, response);
        throw new Error('No se encontró JSON válido en la respuesta');
      }

      let jsonString = jsonMatch[0];
      
      // Limpiar caracteres problemáticos comunes
      jsonString = jsonString
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remover caracteres de control
        .replace(/,\s*}/g, '}') // Remover comas antes de }
        .replace(/,\s*]/g, ']') // Remover comas antes de ]
        .replace(/\n/g, ' ') // Reemplazar saltos de línea con espacios
        .replace(/\r/g, '') // Remover retornos de carro
        .replace(/\t/g, ' ') // Reemplazar tabs con espacios
        .replace(/\s+/g, ' ') // Normalizar espacios múltiples
        .trim();

      console.log(`🧹 [${questionData.id}] JSON limpiado (${jsonString.length} caracteres)`);
      console.log(`📝 [${questionData.id}] Primeros 300 caracteres del JSON:`, jsonString.substring(0, 300) + '...');

      let parsed;
      try {
        parsed = JSON.parse(jsonString);
        console.log(`✅ [${questionData.id}] JSON parseado exitosamente`);
      } catch (parseError) {
        console.error(`❌ [${questionData.id}] Error parseando JSON:`, parseError);
        console.error(`📄 JSON problemático:`, jsonString);
        throw new Error(`Error parseando JSON: ${parseError}`);
      }
      
      // Validar estructura mínima requerida
      if (!parsed.summary) {
        console.warn(`⚠️ [${questionData.id}] Respuesta sin summary, usando valor por defecto`);
      }
      
      const sources = (parsed.sources || []).slice(0, maxSources);
      console.log(`📊 [${questionData.id}] Procesando ${sources.length} fuentes`);

      const result = {
        questionId: questionData.id,
        question: questionData.question,
        category: questionData.category,
        summary: parsed.summary || 'Análisis completado sin resumen específico',
        sources: sources.map((source: any, index: number) => {
          const processedSource = {
            url: source.url || '',
            title: source.title || `Fuente ${index + 1}`,
            snippet: source.snippet || '',
            domain: source.domain || '',
            isPriority: this.isPrioritySource(source.domain || source.url || ''),
            fullContent: source.fullContent || response || '' // Guardar contenido completo
          };
          console.log(`🔗 [${questionData.id}] Fuente ${index + 1}: ${processedSource.domain} (${processedSource.isPriority ? 'prioritaria' : 'normal'})`);
          return processedSource;
        }),
        brandMentions: parsed.brandMentions || [],
        sourcesCited: parsed.sourcesCited || [],
        sentiment: parsed.sentiment || 'neutral',
        confidenceScore: Math.min(Math.max(parsed.confidenceScore || 0.75, 0.7), 0.95) // Mejorar confianza mínima
      };
      
      console.log(`🎯 [${questionData.id}] Análisis parseado exitosamente - Confianza: ${(result.confidenceScore * 100).toFixed(1)}%, Fuentes: ${result.sources.length}, Marcas: ${result.brandMentions.length}`);
      
      return result;
    } catch (error) {
      console.error(`🔴 [${questionData.id}] Error crítico parseando respuesta OpenAI:`, error);
      console.error(`📄 [${questionData.id}] Respuesta raw completa:`, response);
      console.error(`📝 [${questionData.id}] Pregunta que causó el error:`, questionData.question);
      console.error(`🔧 [${questionData.id}] Configuración:`, configuration);
      
      return this.createErrorAnalysis(questionData);
    }
  }

  /**
   * Parsea la respuesta de OpenAI
   */
  private parseAnalysisResponse(questionData: any, response: string, maxSources: number): QuestionAnalysis {
    try {
      console.log('Respuesta OpenAI raw:', response);
      
      // Limpiar la respuesta para extraer solo el JSON
      let cleanedResponse = response.trim();
      
      // Buscar el JSON entre ```json y ``` si existe
      const jsonCodeBlockMatch = cleanedResponse.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonCodeBlockMatch) {
        cleanedResponse = jsonCodeBlockMatch[1].trim();
      }
      
      // Buscar el JSON principal
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No se encontró JSON válido en la respuesta:', response);
        throw new Error('No se encontró JSON válido en la respuesta');
      }

      let jsonString = jsonMatch[0];
      
      // Limpiar caracteres problemáticos comunes
      jsonString = jsonString
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remover caracteres de control
        .replace(/,\s*}/g, '}') // Remover comas antes de }
        .replace(/,\s*]/g, ']') // Remover comas antes de ]
        .replace(/\n/g, ' ') // Reemplazar saltos de línea con espacios
        .replace(/\r/g, '') // Remover retornos de carro
        .replace(/\t/g, ' ') // Reemplazar tabs con espacios
        .replace(/\s+/g, ' ') // Normalizar espacios múltiples
        .trim();

      console.log('JSON limpiado:', jsonString);

      const parsed = JSON.parse(jsonString);
      
      return {
        questionId: questionData.id,
        question: questionData.question,
        category: questionData.category,
        summary: parsed.summary || 'Análisis no disponible',
        sources: (parsed.sources || []).slice(0, maxSources).map((source: any) => ({
          url: source.url || '',
          title: source.title || '',
          snippet: source.snippet || '',
          domain: source.domain || '',
          isPriority: this.isPrioritySource(source.domain || source.url || ''),
          fullContent: source.fullContent || response || '' // Guardar contenido completo
        })),
        brandMentions: parsed.brandMentions || [],
        sourcesCited: parsed.sourcesCited || [],
        sentiment: parsed.sentiment || 'neutral',
        confidenceScore: Math.min(Math.max(parsed.confidenceScore || 0.75, 0.7), 0.95) // Mejorar confianza mínima
      };
    } catch (error) {
      console.error(`🔴 Error parseando respuesta OpenAI para pregunta ${questionData.id}:`, error);
      console.error(`📄 Respuesta raw:`, response);
      return this.createErrorAnalysis(questionData);
    }
  }

  /**
   * Verifica si una fuente es prioritaria con configuración personalizada
   */
  private isPrioritySourceWithConfiguration(urlOrDomain: string, configuration: any): boolean {
    const domain = urlOrDomain.toLowerCase();
    const prioritySources = configuration.prioritySources || PRIORITY_SOURCES;
    return prioritySources.some((source: string) => 
      domain.includes(source.toLowerCase())
    );
  }

  /**
   * Verifica si una fuente es prioritaria
   */
  private isPrioritySource(urlOrDomain: string): boolean {
    const domain = urlOrDomain.toLowerCase();
    return PRIORITY_SOURCES.some(source => 
      domain.includes(source.toLowerCase())
    );
  }

  /**
   * Crea análisis de error cuando falla el procesamiento
   */
  private createErrorAnalysis(questionData: any): QuestionAnalysis {
    console.log(`🔧 [${questionData.id}] Creando análisis de error para pregunta: "${questionData.question}"`);

    return {
      questionId: questionData.id,
      question: questionData.question,
      category: questionData.category,
      summary: 'Error al procesar el análisis. El sistema no pudo generar una respuesta válida para esta pregunta. Por favor, inténtalo de nuevo más tarde o contacta con soporte técnico.',
      sources: [],
      brandMentions: [],
      sourcesCited: [],
      sentiment: 'neutral' as SentimentType,
      confidenceScore: 0.0
    };
  }

  /**
   * Implementa mecanismo de recuperación de errores con reintentos inteligentes
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    context: string = 'operación'
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [${context}] Intento ${attempt}/${maxRetries}`);
        const result = await operation();
        
        if (attempt > 1) {
          console.log(`✅ [${context}] Éxito en intento ${attempt} después de ${attempt - 1} fallos`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        console.error(`❌ [${context}] Fallo en intento ${attempt}:`, error);
        
        // No reintentar en el último intento
        if (attempt === maxRetries) {
          console.error(`🔴 [${context}] Todos los intentos fallaron. Error final:`, error);
          break;
        }
        
        // Calcular delay exponencial con jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`⏳ [${context}] Esperando ${delay.toFixed(0)}ms antes del siguiente intento...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Valida la respuesta de OpenAI antes del procesamiento
   */
  private validateOpenAIResponse(response: string, questionId: string): boolean {
    if (!response || response.trim().length === 0) {
      console.error(`❌ [${questionId}] Respuesta vacía de OpenAI`);
      return false;
    }
    
    if (response.length < 50) {
      console.error(`❌ [${questionId}] Respuesta demasiado corta (${response.length} caracteres): "${response}"`);
      return false;
    }
    
    // Verificar que contenga al menos algo que parezca JSON
    if (!response.includes('{') || !response.includes('}')) {
      console.error(`❌ [${questionId}] Respuesta no contiene JSON válido`);
      return false;
    }
    
    // Verificar que no sea solo un mensaje de error
    const errorPatterns = [
      'i cannot',
      'i\'m unable',
      'i don\'t have access',
      'i cannot provide',
      'i\'m sorry',
      'error occurred',
      'something went wrong'
    ];
    
    const lowerResponse = response.toLowerCase();
    for (const pattern of errorPatterns) {
      if (lowerResponse.includes(pattern)) {
        console.error(`❌ [${questionId}] Respuesta contiene patrón de error: "${pattern}"`);
        return false;
      }
    }
    
    console.log(`✅ [${questionId}] Respuesta de OpenAI validada correctamente`);
    return true;
  }

  /**
   * Consolida menciones de marca con configuración personalizada
   */
  /**
   * Consolida menciones de marca usando configuración personalizada
   *
   * IMPORTANTE - ALCANCE DE LA COMPARATIVA:
   * Esta función consolida las menciones de TODAS las preguntas del análisis,
   * incluyendo tanto preguntas genéricas como preguntas específicas de marca.
   *
   * Ejemplo:
   * - Si una pregunta genérica menciona "Mapfre" 3 veces
   * - Y una pregunta específica de marca menciona "Mapfre" 2 veces
   * - El resultado consolidado mostrará "Mapfre" con 5 menciones totales
   *
   * Este enfoque permite tener una visión global de la presencia de cada marca
   * en todo el conjunto de respuestas generadas por la IA.
   *
   * @param analyses Array de análisis de preguntas (incluye TODAS las preguntas)
   * @param configuration Configuración con targetBrands y competitorBrands
   * @returns Objeto con arrays de targetBrands y competitors consolidados
   */
  private consolidateBrandMentionsWithConfiguration(analyses: QuestionAnalysis[], configuration: any): {
    targetBrands: BrandMention[];
    competitors: BrandMention[];
    otherCompetitors: BrandMention[];
  } {
    const brandMap = new Map<string, BrandMention>();
    const appearanceOrderMap = new Map<string, number>(); // Track order of first appearance
    let orderCounter = 1;

    // Consolidar todas las menciones de TODAS las preguntas
    analyses.forEach(analysis => {
      analysis.brandMentions.forEach(mention => {
        const existing = brandMap.get(mention.brand);
        if (existing) {
          existing.frequency += mention.frequency;
          existing.evidence.push(...mention.evidence);
          existing.mentioned = existing.mentioned || mention.mentioned;
        } else {
          // Track order of first appearance
          if (mention.mentioned && mention.frequency > 0) {
            appearanceOrderMap.set(mention.brand, orderCounter++);
          }
          brandMap.set(mention.brand, { ...mention });
        }
      });
    });

    // Separar marcas objetivo, competidores configurados y competidores descubiertos
    const targetBrands: BrandMention[] = [];
    const competitors: BrandMention[] = [];
    const otherCompetitors: BrandMention[] = [];

    const configTargetBrands = configuration.targetBrands || (configuration.targetBrand ? [configuration.targetBrand] : TARGET_BRANDS);
    const configCompetitorBrands = configuration.competitorBrands || COMPETITOR_BRANDS;

    brandMap.forEach(mention => {
      // Assign appearance order
      const appearanceOrder = appearanceOrderMap.get(mention.brand);
      const mentionWithOrder = {
        ...mention,
        appearanceOrder,
        isDiscovered: false
      };

      if (configTargetBrands.includes(mention.brand as any)) {
        targetBrands.push(mentionWithOrder);
      } else if (configCompetitorBrands.includes(mention.brand as any)) {
        competitors.push(mentionWithOrder);
      } else if (mention.mentioned && mention.frequency > 0) {
        // NUEVO: Capturar competidores descubiertos (no configurados)
        otherCompetitors.push({ ...mentionWithOrder, isDiscovered: true });
      }
    });

    // Ordenar por orden de aparición
    const sortByAppearance = (a: BrandMention, b: BrandMention) =>
      (a.appearanceOrder || 999) - (b.appearanceOrder || 999);

    targetBrands.sort(sortByAppearance);
    competitors.sort(sortByAppearance);
    otherCompetitors.sort(sortByAppearance);

    console.log(`📊 Consolidación: ${targetBrands.length} objetivos, ${competitors.length} competidores, ${otherCompetitors.length} descubiertos`);

    return { targetBrands, competitors, otherCompetitors };
  }

  /**
   * Consolida menciones de marca de todos los análisis
   *
   * IMPORTANTE - ALCANCE DE LA COMPARATIVA:
   * Esta función consolida las menciones de TODAS las preguntas del análisis,
   * incluyendo tanto preguntas genéricas como preguntas específicas de marca.
   *
   * Ejemplo:
   * - Si una pregunta genérica menciona "Mapfre" 3 veces
   * - Y una pregunta específica de marca menciona "Mapfre" 2 veces
   * - El resultado consolidado mostrará "Mapfre" con 5 menciones totales
   *
   * Este enfoque permite tener una visión global de la presencia de cada marca
   * en todo el conjunto de respuestas generadas por la IA.
   */
  private consolidateBrandMentions(analyses: QuestionAnalysis[]): {
    targetBrands: BrandMention[];
    competitors: BrandMention[];
    otherCompetitors: BrandMention[];
  } {
    const brandMap = new Map<string, BrandMention>();
    const appearanceOrderMap = new Map<string, number>();
    let orderCounter = 1;

    // Consolidar todas las menciones
    analyses.forEach(analysis => {
      analysis.brandMentions.forEach(mention => {
        const existing = brandMap.get(mention.brand);
        if (existing) {
          existing.frequency += mention.frequency;
          existing.evidence.push(...mention.evidence);
          existing.mentioned = existing.mentioned || mention.mentioned;
        } else {
          if (mention.mentioned && mention.frequency > 0) {
            appearanceOrderMap.set(mention.brand, orderCounter++);
          }
          brandMap.set(mention.brand, { ...mention });
        }
      });
    });

    // Separar marcas objetivo, competidores y descubiertos
    const targetBrands: BrandMention[] = [];
    const competitors: BrandMention[] = [];
    const otherCompetitors: BrandMention[] = [];

    brandMap.forEach(mention => {
      const appearanceOrder = appearanceOrderMap.get(mention.brand);
      const mentionWithOrder = { ...mention, appearanceOrder, isDiscovered: false };

      if (TARGET_BRANDS.includes(mention.brand as any)) {
        targetBrands.push(mentionWithOrder);
      } else if (COMPETITOR_BRANDS.includes(mention.brand as any)) {
        competitors.push(mentionWithOrder);
      } else if (mention.mentioned && mention.frequency > 0) {
        otherCompetitors.push({ ...mentionWithOrder, isDiscovered: true });
      }
    });

    const sortByAppearance = (a: BrandMention, b: BrandMention) =>
      (a.appearanceOrder || 999) - (b.appearanceOrder || 999);

    targetBrands.sort(sortByAppearance);
    competitors.sort(sortByAppearance);
    otherCompetitors.sort(sortByAppearance);

    return { targetBrands, competitors, otherCompetitors };
  }

  /**
   * Consolida menciones de marca por tipo de pregunta
   *
   * Separa las menciones entre:
   * - Preguntas genéricas: Aquellas que NO mencionan marcas específicas en el texto de la pregunta
   * - Preguntas específicas: Aquellas que SÍ mencionan marcas específicas en el texto de la pregunta
   *
   * @param analyses Array de análisis de preguntas
   * @param configuration Configuración con targetBrands y competitorBrands
   * @returns Objeto con menciones separadas por tipo de pregunta
   */
  consolidateBrandMentionsByQuestionType(analyses: QuestionAnalysis[], configuration?: any): {
    all: {
      targetBrands: BrandMention[];
      competitors: BrandMention[];
      otherCompetitors: BrandMention[];
    };
    generic: {
      targetBrands: BrandMention[];
      competitors: BrandMention[];
      otherCompetitors: BrandMention[];
    };
    specific: {
      targetBrands: BrandMention[];
      competitors: BrandMention[];
      otherCompetitors: BrandMention[];
    };
  } {
    // Determinar marcas objetivo y competidores de la configuración
    const targetBrands = configuration?.targetBrands ||
                         (configuration?.targetBrand ? [configuration.targetBrand] : TARGET_BRANDS);
    const competitorBrands = configuration?.competitorBrands || COMPETITOR_BRANDS;
    const allBrands = [...targetBrands, ...competitorBrands];

    // Separar análisis por tipo de pregunta
    const genericQuestions: QuestionAnalysis[] = [];
    const specificQuestions: QuestionAnalysis[] = [];

    analyses.forEach(analysis => {
      // Verificar si la pregunta menciona alguna marca
      const questionLower = analysis.question.toLowerCase();
      const mentionsBrand = allBrands.some(brand =>
        questionLower.includes(brand.toLowerCase())
      );

      if (mentionsBrand) {
        specificQuestions.push(analysis);
      } else {
        genericQuestions.push(analysis);
      }
    });

    // Consolidar menciones por tipo
    const allMentions = configuration ?
      this.consolidateBrandMentionsWithConfiguration(analyses, configuration) :
      this.consolidateBrandMentions(analyses);

    const genericMentions = configuration ?
      this.consolidateBrandMentionsWithConfiguration(genericQuestions, configuration) :
      this.consolidateBrandMentions(genericQuestions);

    const specificMentions = configuration ?
      this.consolidateBrandMentionsWithConfiguration(specificQuestions, configuration) :
      this.consolidateBrandMentions(specificQuestions);

    return {
      all: allMentions,
      generic: genericMentions,
      specific: specificMentions
    };
  }

  /**
   * Genera un resumen ejecutivo consolidado de todas las preguntas analizadas
   */
  private generateExecutiveSummary(analysis: AnalysisResult): string {
    let summary = '';

    // Estadísticas generales
    const totalQuestions = analysis.questions.length;
    const avgConfidence = analysis.overallConfidence;

    // Análisis de sentimiento general
    const sentimentCounts = {
      positive: 0,
      neutral: 0,
      negative: 0
    };

    analysis.questions.forEach(q => {
      if (q.sentiment === 'positive') sentimentCounts.positive++;
      else if (q.sentiment === 'negative') sentimentCounts.negative++;
      else sentimentCounts.neutral++;
    });

    // Menciones de marcas objetivo
    const targetBrandsMentioned = analysis.brandSummary.targetBrands.filter(b => b.mentioned);
    const competitorsMentioned = analysis.brandSummary.competitors.filter(b => b.mentioned);

    // Categorías analizadas
    const categories = [...new Set(analysis.questions.map(q => q.category))];

    summary += `### 📊 Visión General del Análisis\n\n`;
    summary += `Se realizó un análisis exhaustivo de **${totalQuestions} preguntas** distribuidas en ${categories.length} categorías diferentes. `;
    summary += `El nivel de confianza promedio del análisis fue del **${(avgConfidence * 100).toFixed(1)}%**, `;
    summary += `procesando ${analysis.totalSources} fuentes de información.\n\n`;

    summary += `### 🎯 Hallazgos Clave de Menciones de Marca\n\n`;

    if (targetBrandsMentioned.length > 0) {
      summary += `**Marcas Objetivo:**\n`;
      targetBrandsMentioned.forEach(brand => {
        const sentimentEmoji = brand.context === 'positive' ? '✅' : brand.context === 'negative' ? '❌' : '⚪';
        summary += `- ${sentimentEmoji} **${brand.brand}**: ${brand.frequency} menciones (contexto ${brand.context})\n`;
      });
      summary += `\n`;
    } else {
      summary += `**Marcas Objetivo:** No se encontraron menciones significativas en las respuestas analizadas.\n\n`;
    }

    if (competitorsMentioned.length > 0) {
      summary += `**Principales Competidores Mencionados:**\n`;
      const topCompetitors = competitorsMentioned
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 5);

      topCompetitors.forEach(brand => {
        const sentimentEmoji = brand.context === 'positive' ? '✅' : brand.context === 'negative' ? '❌' : '⚪';
        summary += `- ${sentimentEmoji} **${brand.brand}**: ${brand.frequency} menciones (contexto ${brand.context})\n`;
      });
      summary += `\n`;
    }

    summary += `### 😊 Análisis de Sentimiento Global\n\n`;
    summary += `- **Positivo:** ${sentimentCounts.positive} preguntas (${((sentimentCounts.positive/totalQuestions)*100).toFixed(1)}%)\n`;
    summary += `- **Neutral:** ${sentimentCounts.neutral} preguntas (${((sentimentCounts.neutral/totalQuestions)*100).toFixed(1)}%)\n`;
    summary += `- **Negativo:** ${sentimentCounts.negative} preguntas (${((sentimentCounts.negative/totalQuestions)*100).toFixed(1)}%)\n\n`;

    summary += `### 📁 Categorías Analizadas\n\n`;
    categories.forEach(category => {
      const questionsInCategory = analysis.questions.filter(q => q.category === category).length;
      summary += `- **${category}**: ${questionsInCategory} pregunta(s)\n`;
    });
    summary += `\n`;

    summary += `### 🔍 Conclusiones Principales\n\n`;

    if (targetBrandsMentioned.length === 0) {
      summary += `⚠️ **Visibilidad limitada**: Las marcas objetivo no aparecen mencionadas de forma significativa en las respuestas de IA generativa analizadas. `;
      summary += `Esto sugiere una oportunidad de mejora en la presencia digital y SEO para influir en las respuestas de modelos de IA.\n\n`;
    } else {
      const positiveTargetMentions = targetBrandsMentioned.filter(b => b.context === 'positive').length;
      const totalTargetMentions = targetBrandsMentioned.reduce((sum, b) => sum + b.frequency, 0);

      if (positiveTargetMentions > 0) {
        summary += `✅ **Presencia positiva**: Se detectaron ${totalTargetMentions} menciones de marcas objetivo, `;
        summary += `con ${positiveTargetMentions} marca(s) mencionadas en contexto positivo.\n\n`;
      } else {
        summary += `⚠️ **Atención requerida**: Aunque las marcas objetivo fueron mencionadas ${totalTargetMentions} veces, `;
        summary += `el contexto no fue predominantemente positivo.\n\n`;
      }
    }

    if (competitorsMentioned.length > 0) {
      const topCompetitor = competitorsMentioned.sort((a, b) => b.frequency - a.frequency)[0];
      summary += `🏆 **Competidor más mencionado**: ${topCompetitor.brand} con ${topCompetitor.frequency} menciones `;
      summary += `en contexto ${topCompetitor.context}.\n\n`;
    }

    return summary;
  }

  /**
   * Genera informe en formato Markdown
   */
  generateMarkdownReport(analysis: AnalysisResult, configuration?: any): string {
    const date = new Date(analysis.timestamp).toLocaleDateString('es-ES', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let markdown = `# Informe de Análisis de Presencia en IA Generativa\n\n`;
    markdown += `**Fecha:** ${date}\n`;
    markdown += `**ID de Análisis:** ${analysis.analysisId}\n`;
    markdown += `**Categorías analizadas:** ${analysis.categories.join(', ')}\n`;
    markdown += `**Confianza general:** ${(analysis.overallConfidence * 100).toFixed(1)}%\n\n`;

    // Resumen ejecutivo consolidado
    markdown += `## 📋 Resumen Ejecutivo\n\n`;
    markdown += this.generateExecutiveSummary(analysis);
    markdown += `\n---\n\n`;

    // Comparativas de menciones de marca
    if (analysis.brandSummaryByType) {
      markdown += `## 📊 Comparativa de Menciones de Marca\n\n`;

      // Sección de preguntas genéricas
      markdown += `### 📋 Solo Preguntas Genéricas\n`;
      markdown += `*Menciones en preguntas que NO incluyen nombres de marca específicos*\n\n`;

      if (analysis.brandSummaryByType.generic.targetBrands.length > 0) {
        markdown += `#### Marcas Objetivo\n`;
        analysis.brandSummaryByType.generic.targetBrands
          .filter(b => b.mentioned && b.frequency > 0)
          .sort((a, b) => b.frequency - a.frequency)
          .forEach(brand => {
            const sentiment = brand.context === 'positive' ? '✅' : brand.context === 'negative' ? '❌' : '⚪';
            markdown += `- ${sentiment} **${brand.brand}**: ${brand.frequency} menciones\n`;
          });
        markdown += `\n`;
      }

      if (analysis.brandSummaryByType.generic.competitors.length > 0) {
        markdown += `#### Competidores\n`;
        analysis.brandSummaryByType.generic.competitors
          .filter(b => b.mentioned && b.frequency > 0)
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, 5)
          .forEach(brand => {
            const sentiment = brand.context === 'positive' ? '✅' : brand.context === 'negative' ? '❌' : '⚪';
            markdown += `- ${sentiment} **${brand.brand}**: ${brand.frequency} menciones\n`;
          });
        markdown += `\n`;
      }

      // Sección de preguntas específicas
      markdown += `### 🎯 Solo Preguntas Específicas de Marca\n`;
      markdown += `*Menciones en preguntas que SÍ incluyen nombres de marca específicos*\n\n`;

      if (analysis.brandSummaryByType.specific.targetBrands.length > 0) {
        markdown += `#### Marcas Objetivo\n`;
        analysis.brandSummaryByType.specific.targetBrands
          .filter(b => b.mentioned && b.frequency > 0)
          .sort((a, b) => b.frequency - a.frequency)
          .forEach(brand => {
            const sentiment = brand.context === 'positive' ? '✅' : brand.context === 'negative' ? '❌' : '⚪';
            markdown += `- ${sentiment} **${brand.brand}**: ${brand.frequency} menciones\n`;
          });
        markdown += `\n`;
      }

      if (analysis.brandSummaryByType.specific.competitors.length > 0) {
        markdown += `#### Competidores\n`;
        analysis.brandSummaryByType.specific.competitors
          .filter(b => b.mentioned && b.frequency > 0)
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, 5)
          .forEach(brand => {
            const sentiment = brand.context === 'positive' ? '✅' : brand.context === 'negative' ? '❌' : '⚪';
            markdown += `- ${sentiment} **${brand.brand}**: ${brand.frequency} menciones\n`;
          });
        markdown += `\n`;
      }

      markdown += `---\n\n`;
    }

    // Menciones de marcas objetivo (comparativa total)
    if (analysis.brandSummary.targetBrands.length > 0) {
      const targetBrandsLabel = configuration?.targetBrands?.join(', ') ||
                                configuration?.targetBrand ||
                                'Marcas Objetivo';
      markdown += `## 🎯 Comparativa Total - ${targetBrandsLabel}\n`;
      markdown += `*Incluye TODAS las preguntas (genéricas + específicas)*\n\n`;

      analysis.brandSummary.targetBrands.forEach(brand => {
        const sentiment = brand.context === 'positive' ? '✅' : brand.context === 'negative' ? '❌' : '⚪';
        markdown += `### ${sentiment} ${brand.brand}\n`;
        markdown += `- **Mencionada:** ${brand.mentioned ? 'Sí' : 'No'}\n`;
        markdown += `- **Frecuencia Total:** ${brand.frequency} menciones\n`;
        markdown += `- **Contexto:** ${brand.context}\n`;
        if (brand.evidence.length > 0) {
          markdown += `- **Evidencia:**\n`;
          brand.evidence.slice(0, 3).forEach(evidence => {
            markdown += `  - "${evidence}"\n`;
          });
        }
        markdown += `\n`;
      });
    }

    // Análisis por pregunta
    markdown += `## 📝 Análisis Detallado por Pregunta\n\n`;
    analysis.questions.forEach((q, index) => {
      markdown += `### ${index + 1}. ${q.question}\n\n`;
      markdown += `**Categoría:** ${q.category}\n`;
      markdown += `**Confianza:** ${(q.confidenceScore * 100).toFixed(1)}%\n`;
      markdown += `**Sentimiento general:** ${q.sentiment}\n\n`;

      // Análisis resumido
      markdown += `#### 📊 Análisis\n\n`;
      markdown += `${q.summary}\n\n`;

      // Contenido completo extraído del LLM - SIEMPRE mostrar
      if (q.sources.length > 0) {
        const source = q.sources[0];
        const fullContent = source.fullContent || source.snippet || 'No hay contenido disponible';
        markdown += `#### 🤖 Respuesta Completa del LLM (${source.domain})\n\n`;
        markdown += `\`\`\`\n${fullContent}\n\`\`\`\n\n`;
      } else {
        markdown += `#### 🤖 Respuesta Completa del LLM\n\n`;
        markdown += `\`\`\`\nNo hay fuentes disponibles para esta pregunta\n\`\`\`\n\n`;
      }

      // Menciones de marca en esta pregunta
      if (q.brandMentions && q.brandMentions.length > 0) {
        const mentionedBrands = q.brandMentions.filter(b => b.mentioned && b.frequency > 0);
        if (mentionedBrands.length > 0) {
          markdown += `#### 🏢 Marcas Mencionadas\n\n`;
          mentionedBrands.forEach(brand => {
            const sentimentEmoji = brand.context === 'positive' ? '✅' : brand.context === 'negative' ? '❌' : '⚪';
            markdown += `- ${sentimentEmoji} **${brand.brand}** (${brand.frequency} mención/es - contexto ${brand.context})\n`;
            if (brand.evidence && brand.evidence.length > 0) {
              markdown += `  - Evidencia: "${brand.evidence[0]}"\n`;
            }
          });
          markdown += `\n`;
        }
      }

      // Fuentes citadas por el LLM
      if (q.sourcesCited && q.sourcesCited.length > 0) {
        markdown += `#### 📖 Fuentes Citadas por el LLM\n\n`;
        q.sourcesCited.forEach(source => {
          const credIcon = source.credibility === 'high' ? '🟢' : source.credibility === 'medium' ? '🟡' : '🔴';
          const typeIcon = source.type === 'website' ? '🌐' : source.type === 'study' ? '📊' : source.type === 'organization' ? '🏛️' : source.type === 'media' ? '📰' : source.type === 'government' ? '🏛️' : '📄';
          markdown += `- ${typeIcon} **${source.name}** ${credIcon}\n`;
          markdown += `  - Tipo: ${source.type}\n`;
          if (source.url) {
            markdown += `  - URL: ${source.url}\n`;
          }
          if (source.context) {
            markdown += `  - Contexto: "${source.context}"\n`;
          }
        });
        markdown += `\n`;
      }

      // Fuentes consultadas
      if (q.sources.length > 0) {
        markdown += `#### 📚 Fuentes Consultadas\n\n`;
        q.sources.forEach(source => {
          const priority = source.isPriority ? ' ⭐' : '';
          markdown += `- **Fuente:** ${source.domain}${priority}\n`;
          markdown += `- **Título:** ${source.title}\n`;
          if (source.url !== 'generative-ai-response') {
            markdown += `- **URL:** ${source.url}\n`;
          }
        });
        markdown += `\n`;
      }

      markdown += `---\n\n`;
    });

    return markdown;
  }

  /**
   * Genera informe en formato JSON estructurado
   */
  generateJSONReport(analysis: AnalysisResult): object {
    const baseReport = {
      metadata: {
        analysisId: analysis.analysisId,
        timestamp: analysis.timestamp,
        timezone: "Europe/Madrid",
        locale: "es-ES",
        categories: analysis.categories,
        totalQuestions: analysis.questions.length,
        overallConfidence: analysis.overallConfidence
      },
      metrics: {
        totalSources: analysis.totalSources,
        prioritySources: analysis.prioritySources,
        prioritySourcesPercentage: analysis.totalSources > 0 ?
          (analysis.prioritySources / analysis.totalSources * 100) : 0
      },
      brandAnalysis: {
        targetBrands: analysis.brandSummary.targetBrands.map(brand => ({
          name: brand.brand,
          mentioned: brand.mentioned,
          frequency: brand.frequency,
          sentiment: brand.context,
          evidence: brand.evidence,
          relevanceScore: brand.frequency > 0 ? Math.min(brand.frequency / 10, 1) : 0
        })),
        competitors: analysis.brandSummary.competitors.map(brand => ({
          name: brand.brand,
          mentioned: brand.mentioned,
          frequency: brand.frequency,
          sentiment: brand.context,
          evidence: brand.evidence,
          relevanceScore: brand.frequency > 0 ? Math.min(brand.frequency / 10, 1) : 0
        }))
      },
      detailedAnalysis: analysis.questions.map(q => ({
        questionId: q.questionId,
        question: q.question,
        category: q.category,
        summary: q.summary,
        sentiment: q.sentiment,
        confidenceScore: q.confidenceScore,
        sources: q.sources.map(source => ({
          url: source.url,
          title: source.title,
          snippet: source.snippet,
          fullContent: source.fullContent, // Incluir contenido completo del LLM
          domain: source.domain,
          isPriority: source.isPriority,
          trustScore: source.isPriority ? 0.9 : 0.6
        })),
        brandMentions: q.brandMentions,
        sourcesCited: q.sourcesCited || [] // Fuentes citadas por el LLM en su respuesta
      }))
    };

    // Agregar comparativas por tipo si están disponibles
    if (analysis.brandSummaryByType) {
      (baseReport as any).brandAnalysisByType = {
        generic: {
          description: "Menciones en preguntas que NO incluyen nombres de marca específicos",
          targetBrands: analysis.brandSummaryByType.generic.targetBrands.map(brand => ({
            name: brand.brand,
            mentioned: brand.mentioned,
            frequency: brand.frequency,
            sentiment: brand.context,
            evidence: brand.evidence
          })),
          competitors: analysis.brandSummaryByType.generic.competitors.map(brand => ({
            name: brand.brand,
            mentioned: brand.mentioned,
            frequency: brand.frequency,
            sentiment: brand.context,
            evidence: brand.evidence
          }))
        },
        specific: {
          description: "Menciones en preguntas que SÍ incluyen nombres de marca específicos",
          targetBrands: analysis.brandSummaryByType.specific.targetBrands.map(brand => ({
            name: brand.brand,
            mentioned: brand.mentioned,
            frequency: brand.frequency,
            sentiment: brand.context,
            evidence: brand.evidence
          })),
          competitors: analysis.brandSummaryByType.specific.competitors.map(brand => ({
            name: brand.brand,
            mentioned: brand.mentioned,
            frequency: brand.frequency,
            sentiment: brand.context,
            evidence: brand.evidence
          }))
        },
        all: {
          description: "Menciones en TODAS las preguntas (genéricas + específicas)",
          targetBrands: analysis.brandSummaryByType.all.targetBrands.map(brand => ({
            name: brand.brand,
            mentioned: brand.mentioned,
            frequency: brand.frequency,
            sentiment: brand.context,
            evidence: brand.evidence
          })),
          competitors: analysis.brandSummaryByType.all.competitors.map(brand => ({
            name: brand.brand,
            mentioned: brand.mentioned,
            frequency: brand.frequency,
            sentiment: brand.context,
            evidence: brand.evidence
          }))
        }
      };
    }

    return baseReport;
  }

  /**
   * Genera informe en formato tabla CSV
   */
  generateTableReport(analysis: AnalysisResult, configuration?: any): string {
    // Cabecera del CSV
    let csv = 'Pregunta,Categoría,Marcas Mencionadas,Confianza (%),Sentimiento\n';

    // Procesar cada pregunta
    analysis.questions.forEach(q => {
      // Extraer las marcas mencionadas
      const mentionedBrands = q.brandMentions
        ?.filter(b => b.mentioned && b.frequency > 0)
        .map(b => `${b.brand} (${b.context})`)
        .join('; ') || 'Ninguna';

      // Formatear la pregunta para CSV (escapar comillas y comas)
      const questionText = `"${q.question.replace(/"/g, '""')}"`;
      const category = `"${q.category}"`;
      const brands = `"${mentionedBrands}"`;
      const confidence = (q.confidenceScore * 100).toFixed(1);
      const sentiment = q.sentiment;

      // Agregar fila
      csv += `${questionText},${category},${brands},${confidence},${sentiment}\n`;
    });

    return csv;
  }

  /**
   * Ejecuta análisis con múltiples modelos de IA (simulados)
   */
  async executeMultiModelAnalysis(questions: any[], configuration: any, onProgress?: (completed: number, total: number, questionId: string) => void): Promise<AnalysisResult> {
  const startTime = Date.now();
  const analysisId = `multimodel_analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = new Date().toISOString();

  // Solo usar ChatGPT por defecto si no se especifican otros modelos
  const requestedModels: AIModelPersona[] = configuration.aiModels || ['chatgpt'];

  // OPTIMIZACIÓN: Filtrar modelos SIN API key configurada ANTES de empezar
  // Esto evita intentar 22 veces modelos que van a fallar
  const aiModels = requestedModels.filter(model => {
    const validation = this.validateApiKeyForModel(model);
    if (!validation.valid) {
      console.log(`⏭️ Modelo ${model} excluido: ${validation.error}`);
    }
    return validation.valid;
  });

  // Si no queda ningún modelo válido, usar chatgpt por defecto
  if (aiModels.length === 0) {
    console.log('⚠️ Ningún modelo con API key válida, usando chatgpt por defecto');
    aiModels.push('chatgpt');
  }

  console.log(`🚀 Iniciando análisis multi-modelo con ID: ${analysisId}`);
  console.log(`🤖 Modelos solicitados: ${requestedModels.join(', ')}`);
  console.log(`✅ Modelos disponibles (con API key): ${aiModels.join(', ')}`);

  const results: QuestionAnalysis[] = [];
  const errors: string[] = [];

  // Crear configuración con modelos filtrados
  const filteredConfiguration = {
    ...configuration,
    aiModels: aiModels  // Usar solo modelos con API key válida
  };

  try {
    // Procesar preguntas EN PARALELO para máxima velocidad
    console.log(`🚀 Procesando ${questions.length} preguntas en PARALELO...`);

    let multiModelCompleted = 0;
    const analysisPromises = questions.map((questionData, index) => {
      console.log(`📝 [${index + 1}/${questions.length}] Iniciando: ${questionData.question.substring(0, 50)}...`);
      return this.analyzeQuestionWithMultipleModels(questionData, filteredConfiguration)
        .then(result => {
          multiModelCompleted++;
          console.log(`✅ [${multiModelCompleted}/${questions.length}] Completada`);
          if (onProgress) {
            onProgress(multiModelCompleted, questions.length, questionData.id || `q_${index}`);
          }
          return result;
        })
        .catch(error => {
          multiModelCompleted++;
          console.error(`🔴 [${multiModelCompleted}/${questions.length}] Error: ${error.message}`);
          if (onProgress) {
            onProgress(multiModelCompleted, questions.length, questionData.id || `q_${index}`);
          }
          throw error;
        });
    });

    const parallelResults = await Promise.all(analysisPromises);
    results.push(...parallelResults);

    console.log(`✅ Todas las preguntas procesadas en paralelo`);
  
    // Calcular métricas generales
    const totalSources = results.reduce((sum, q) => sum + q.sources.length, 0);
    const prioritySources = results.reduce((sum, q) => 
      sum + q.sources.filter(s => s.isPriority).length, 0
    );
    
    const overallConfidence = results.reduce((sum, q) => sum + q.confidenceScore, 0) / results.length;
  
    // Consolidar menciones de marca con análisis competitivo
    const consolidatedMentions = this.consolidateBrandMentionsWithCompetitiveAnalysis(results, configuration);

    // Nuevo: Consolidar por tipo de pregunta
    const mentionsByType = this.consolidateBrandMentionsByQuestionType(results, configuration);

    const endTime = Date.now();
    console.log(`✅ Análisis multi-modelo completado en ${endTime - startTime}ms`);
    console.log(`   📊 Preguntas procesadas: ${results.length}`);
    console.log(`   🏷️ Menciones de marca consolidadas: ${consolidatedMentions.targetBrands.length + consolidatedMentions.competitors.length}`);
    console.log(`   📈 Confianza general: ${(overallConfidence * 100).toFixed(1)}%`);
  
    return {
      analysisId,
      timestamp,
      categories: [],
      questions: results,
      overallConfidence,
      totalSources,
      prioritySources,
      brandSummary: consolidatedMentions,
      brandSummaryByType: mentionsByType
    };
  
  } catch (error) {
    console.error('🔴 Error en análisis multi-modelo:', error);
    throw error;
  }
}

/**
 * Analiza una pregunta con múltiples modelos de IA simulados
 */
private async analyzeQuestionWithMultipleModels(questionData: any, configuration: any): Promise<QuestionAnalysis> {
  const questionId = questionData.id || `q_${Date.now()}`;
  // Solo usar ChatGPT por defecto si no se especifican otros modelos
  const aiModels: AIModelPersona[] = configuration.aiModels || ['chatgpt'];

  console.log(`🤖 [${questionId}] Analizando con modelos: ${aiModels.join(', ')}`);

  const multiModelResults: MultiModelAnalysis[] = [];
  const failedModels: string[] = [];

  // Analizar con cada modelo de IA
  for (const modelPersona of aiModels) {
    try {
      console.log(`🔄 [${questionId}] Intentando análisis con ${modelPersona}...`);
      const modelAnalysis = await this.analyzeWithAIPersona(questionData, modelPersona, configuration);
      multiModelResults.push(modelAnalysis);
      console.log(`✅ [${questionId}] Análisis completado con ${modelPersona}`);
    } catch (error: any) {
      // Si es error de autenticación (API key inválida), propagar inmediatamente
      if (error?.status === 401 || error?.code === 'invalid_api_key') {
        console.error(`🔴 [${questionId}] API key inválida para ${modelPersona} - abortando análisis`);
        const authError = new Error(`API_KEY_INVALID:${modelPersona}:${error.message || 'API key inválida'}`);
        (authError as any).isAuthError = true;
        (authError as any).provider = modelPersona;
        throw authError;
      }
      console.error(`🔴 [${questionId}] Error con modelo ${modelPersona}:`, error);
      failedModels.push(modelPersona);
      console.log(`⚠️ [${questionId}] Modelo ${modelPersona} omitido, continuando con otros modelos...`);
    }
  }

  // Log de resultados
  if (multiModelResults.length > 0) {
    console.log(`✅ [${questionId}] ${multiModelResults.length} de ${aiModels.length} modelos completados exitosamente`);
  }

  if (failedModels.length > 0) {
    console.log(`⚠️ [${questionId}] Modelos que fallaron: ${failedModels.join(', ')}`);
  }

  // Consolidar resultados de múltiples modelos (maneja gracefully si está vacío)
  return this.consolidateMultiModelResults(questionData, multiModelResults, configuration);
}

/**
 * Verifica si la API key está disponible para un modelo específico
 */
private validateApiKeyForModel(modelPersona: AIModelPersona): { valid: boolean; error?: string } {
  switch (modelPersona) {
    case 'chatgpt':
      return { valid: true };

    case 'claude':
      if (!this.anthropicClient) {
        return { valid: false, error: 'No hay API key de Anthropic configurada.' };
      }
      return { valid: true };

    case 'gemini':
      if (!this.googleClient) {
        return { valid: false, error: 'No hay API key de Google AI configurada.' };
      }
      return { valid: true };

    case 'perplexity':
      // Perplexity NO está implementado todavía - siempre excluir
      return { valid: false, error: 'API de Perplexity no está implementada todavía. Solo ChatGPT está disponible.' };

    default:
      return { valid: false, error: `Modelo desconocido: ${modelPersona}` };
  }
}

/**
 * Analiza con una persona de IA específica - 2 LLAMADAS SIN SESGO
 * 1. Búsqueda web: Pregunta LIMPIA (sin mencionar marcas) → Respuesta natural
 * 2. Análisis barato: gpt-4o-mini analiza la respuesta → JSON con marcas
 */
private async analyzeWithAIPersona(questionData: any, modelPersona: AIModelPersona, configuration: any): Promise<MultiModelAnalysis> {
  const questionId = questionData.id || `q_${Date.now()}`;

  // Validar API key para el modelo
  const apiValidation = this.validateApiKeyForModel(modelPersona);
  if (!apiValidation.valid) {
    throw new Error(apiValidation.error);
  }

  if (modelPersona !== 'chatgpt' && modelPersona !== 'gemini') {
    throw new Error(`API de ${modelPersona} no está activada. Solo ChatGPT y Gemini están disponibles.`);
  }

  const targetBrand = configuration.targetBrand || (configuration.targetBrands?.[0]) || 'Coca-Cola';
  const competitors = configuration.competitorBrands || COMPETITOR_BRANDS;
  const countryName = configuration.countryName || 'España';
  const countryContext = configuration.countryContext || 'en España, considerando el mercado español';
  const countryLanguage = configuration.countryLanguage || 'Español';
  const countryCode = configuration.countryCode || 'ES';

  // ========== LLAMADA 1: Pregunta LIMPIA sin sesgo ==========
  // NO mencionamos marcas para obtener una respuesta natural
  // PERO sí indicamos país e idioma para contextualizar la búsqueda
  const cleanPrompt = `${questionData.question}

Responde de forma completa y útil (200-400 palabras), enfocándote en ${countryName}.`;

  let naturalResponse: string;
  let webSources: WebSearchSource[];

  console.log(`🔍 [${modelPersona}] Llamada 1: Búsqueda web (pregunta limpia, país: ${countryName})...`);

  if (modelPersona === 'gemini') {
    // Fase 1 con Gemini + Google Search Grounding
    const geminiModel = configuration.selectedGeminiModel || 'gemini-2.5-flash';
    const geminiResult = await this.generateWithGoogle(cleanPrompt, geminiModel, configuration);
    naturalResponse = geminiResult.content;
    webSources = geminiResult.webSources;
  } else {
    // Fase 1 con OpenAI (chatgpt)
    const systemPrompt = `Responde siempre en ${countryLanguage}. Contexto geográfico: ${countryName}.`;

    const searchResponse = await this.client.chat.completions.create({
      model: this.GENERATION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: cleanPrompt }
      ],
      max_tokens: configuration.maxTokens || 2000,
      web_search_options: {
        search_context_size: 'medium',
      },
    } as any);

    naturalResponse = searchResponse.choices[0]?.message?.content || '';

    // Extraer fuentes web de las annotations
    const message = searchResponse.choices[0]?.message;
    webSources = this.extractWebSources(message);
  }

  console.log(`📚 [${modelPersona}] Fuentes web extraídas: ${webSources.length}`);
  webSources.forEach(s => console.log(`  📎 ${s.url}`));
  console.log(`📝 [${modelPersona}] Respuesta natural: ${naturalResponse.length} chars`);

  // ========== LLAMADA 2: Análisis con modelo BARATO ==========
  const analysisPrompt = `Analiza la siguiente respuesta de IA y extrae información sobre menciones de marcas.

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

IMPORTANTE: Detecta TODAS las marcas mencionadas, incluso las que no están en la lista de competidores. Ten en cuenta que el contexto es ${countryName} al evaluar las marcas.`;

  console.log(`🧠 [${modelPersona}] Llamada 2: Análisis con modelo barato...`);

  const analysisResponse = await this.client.chat.completions.create({
    model: this.ANALYSIS_MODEL, // gpt-4o-mini - económico
    messages: [{ role: 'user', content: analysisPrompt }],
    temperature: 0.1,
    max_tokens: 1500,
  });

  const analysisContent = analysisResponse.choices[0]?.message?.content || '{}';

  // Parsear JSON del análisis
  let analysisJson: any = {
    targetBrand: { name: targetBrand, mentioned: false, sentiment: 'neutral', position: 0 },
    otherBrands: [],
    confidence: 0.5
  };

  try {
    const cleanedJson = this.cleanJSONResponse(analysisContent);
    analysisJson = JSON.parse(cleanedJson);
  } catch (error) {
    console.error(`⚠️ [${modelPersona}] Error parseando análisis JSON:`, error);
  }

  console.log(`📊 [${modelPersona}] Target "${targetBrand}": ${analysisJson.targetBrand?.mentioned ? 'MENCIONADA' : 'no mencionada'}, sentiment: ${analysisJson.targetBrand?.sentiment}`);
  console.log(`📊 [${modelPersona}] Otras marcas: ${analysisJson.otherBrands?.map((b: any) => b.name).join(', ') || 'ninguna'}`);

  // Convertir a BrandMention[] para compatibilidad
  const brandMentions: BrandMention[] = [];

  // Marca objetivo
  if (analysisJson.targetBrand) {
    brandMentions.push({
      brand: analysisJson.targetBrand.name || targetBrand,
      mentioned: analysisJson.targetBrand.mentioned || false,
      frequency: analysisJson.targetBrand.mentioned ? 1 : 0,
      context: this.mapSentimentToContext(analysisJson.targetBrand.sentiment),
      evidence: [],
      appearanceOrder: analysisJson.targetBrand.position || 0,
      isDiscovered: false,
      detailedSentiment: analysisJson.targetBrand.sentiment || 'neutral'
    });
  }

  // Otras marcas
  if (analysisJson.otherBrands && Array.isArray(analysisJson.otherBrands)) {
    analysisJson.otherBrands.forEach((brand: any) => {
      const isConfiguredCompetitor = competitors.some((c: string) =>
        c.toLowerCase() === brand.name?.toLowerCase()
      );
      brandMentions.push({
        brand: brand.name,
        mentioned: brand.mentioned || true,
        frequency: 1,
        context: this.mapSentimentToContext(brand.sentiment),
        evidence: [],
        appearanceOrder: brand.position || 0,
        isDiscovered: !isConfiguredCompetitor,
        detailedSentiment: brand.sentiment || 'neutral'
      });
    });
  }

  // Convertir webSources a SourceCited
  const sourcesCited: SourceCited[] = webSources.map(source => ({
    name: source.title,
    type: this.classifySourceType(this.extractDomainFromUrl(source.url)) as any,
    url: source.url,
    context: source.snippet,
    credibility: this.calculateSourceCredibility(source.url)
  }));

  return {
    modelPersona,
    response: naturalResponse,  // Respuesta LIMPIA sin sesgo
    brandMentions,
    sourcesCited,
    overallSentiment: analysisJson.targetBrand?.sentiment || 'neutral',
    contextualAnalysis: [],
    confidenceScore: analysisJson.confidence || 0.8
  };
}

/**
 * Parsea la respuesta unificada separando texto de JSON
 */
private parseUnifiedResponse(content: string): { textResponse: string; analysisJson: any } {
  const defaultJson = {
    targetBrand: { name: '', mentioned: false, sentiment: 'neutral', position: 0 },
    otherBrands: [],
    confidence: 0.5
  };

  try {
    // Buscar el bloque JSON
    const jsonMatch = content.match(/---ANALYSIS_JSON---\s*([\s\S]*?)\s*---END_ANALYSIS---/);

    if (jsonMatch) {
      const textResponse = content.replace(/---ANALYSIS_JSON---[\s\S]*---END_ANALYSIS---/, '').trim();
      const jsonStr = jsonMatch[1].trim();
      const analysisJson = JSON.parse(jsonStr);
      return { textResponse, analysisJson };
    }

    // Si no hay bloque JSON, intentar extraer JSON del final
    const lastBraceIndex = content.lastIndexOf('}');
    const firstBraceIndex = content.lastIndexOf('{');

    if (firstBraceIndex > 0 && lastBraceIndex > firstBraceIndex) {
      const possibleJson = content.substring(firstBraceIndex, lastBraceIndex + 1);
      try {
        const analysisJson = JSON.parse(possibleJson);
        if (analysisJson.targetBrand || analysisJson.otherBrands) {
          const textResponse = content.substring(0, firstBraceIndex).trim();
          return { textResponse, analysisJson };
        }
      } catch {}
    }

    // Sin JSON encontrado, devolver todo como texto
    return { textResponse: content, analysisJson: defaultJson };
  } catch (error) {
    console.error('Error parseando respuesta unificada:', error);
    return { textResponse: content, analysisJson: defaultJson };
  }
}

/**
 * Mapea sentimiento detallado a SentimentType básico
 */
private mapSentimentToContext(sentiment: string): SentimentType {
  if (!sentiment) return 'neutral';
  if (sentiment.includes('positive')) return 'positive';
  if (sentiment.includes('negative')) return 'negative';
  return 'neutral';
}

  /**
   * Construye prompt para generar respuesta con persona específica de IA
   */
  private buildPersonaGenerativePrompt(question: string, modelPersona: AIModelPersona, configuration: any): string {
    const targetBrands = configuration.targetBrands || configuration.targetBrand ? [configuration.targetBrand] : TARGET_BRANDS;
    const competitors = configuration.competitorBrands || COMPETITOR_BRANDS;
    
    const personaInstructions = this.getPersonaInstructions(modelPersona);
    
    return `${personaInstructions}

Responde a la siguiente pregunta de manera natural y útil:

"${question}"

Marcas objetivo a considerar: ${targetBrands.join(', ')}
Competidores principales: ${competitors.join(', ')}

Proporciona una respuesta completa, informativa y natural de 200-400 palabras. Puedes mencionar marcas cuando sea apropiado y útil para el usuario.`;
  }

  /**
   * Obtiene instrucciones específicas para cada persona de IA
   */
  private getPersonaInstructions(modelPersona: AIModelPersona): string {
    switch (modelPersona) {
      case 'chatgpt':
        return `Actúa como ChatGPT: Sé conversacional, equilibrado y estructurado. Proporciona información práctica y bien organizada. Usa un tono profesional pero accesible.`;
      
      case 'claude':
        return `Actúa como Claude (Anthropic): Sé analítico, detallado y cuidadoso. Proporciona explicaciones profundas y considera múltiples perspectivas. Usa un tono reflexivo y preciso.`;
      
      case 'gemini':
        return `Actúa como Gemini (Google): Sé conciso, directo y orientado a datos. Proporciona información factual y comparaciones claras. Usa un tono eficiente y basado en hechos.`;
      
      case 'perplexity':
        return `Actúa como Perplexity: Sé investigativo y basado en fuentes. Proporciona información actualizada con referencias implícitas. Usa un tono académico pero accesible.`;
      
      default:
        return `Proporciona una respuesta útil e informativa sobre el tema consultado en España.`;
    }
  }

  /**
   * Obtiene temperatura específica para cada modelo
   */
  private getModelTemperature(modelPersona: AIModelPersona): number {
    switch (modelPersona) {
      case 'chatgpt': return 0.7;
      case 'claude': return 0.5;
      case 'gemini': return 0.3;
      case 'perplexity': return 0.4;
      default: return 0.6;
    }
  }

  /**
   * Construye prompt mejorado para análisis con sentimientos y contexto
   */
  private buildEnhancedAnalysisPrompt(originalQuestion: string, generatedContent: string, modelPersona: AIModelPersona, configuration: any): string {
    const targetBrands = configuration.targetBrands || configuration.targetBrand ? [configuration.targetBrand] : TARGET_BRANDS;
    const competitors = configuration.competitorBrands || COMPETITOR_BRANDS;

    return `Analiza la siguiente respuesta de IA (generada por ${modelPersona}) para detectar menciones de marca y realizar un análisis contextual avanzado:

PREGUNTA ORIGINAL: "${originalQuestion}"

RESPUESTA DE IA A ANALIZAR:
"${generatedContent}"

MARCAS OBJETIVO (configuradas): ${targetBrands.join(', ')}
COMPETIDORES CONOCIDOS (configurados): ${competitors.join(', ')}

IMPORTANTE: Detecta TODAS las marcas mencionadas, incluyendo las que NO están en las listas anteriores. Asigna un número de orden de aparición (1=primera marca mencionada, 2=segunda, etc.)

Realiza un análisis EXHAUSTIVO y responde en formato JSON con esta estructura exacta:

{
  "overallSentiment": "very_positive|positive|neutral|negative|very_negative",
  "contextualInsights": "Análisis detallado del contexto y tono general de la respuesta",
  "brandMentions": [
    {
      "brand": "Nombre exacto de la marca (de las listas configuradas)",
      "mentioned": true/false,
      "frequency": número_de_menciones,
      "appearanceOrder": número (1=primera, 2=segunda, etc. o null si no mencionada),
      "context": "positive|negative|neutral",
      "evidence": ["cita textual 1", "cita textual 2"],
      "detailedSentiment": "very_positive|positive|neutral|negative|very_negative",
      "contextualAnalysis": {
        "sentiment": "very_positive|positive|neutral|negative|very_negative",
        "confidence": 0.0-1.0,
        "reasoning": "Explicación del análisis de sentimiento",
        "competitivePosition": "leader|follower|neutral|not_mentioned",
        "contextType": "comparison|standalone|recommendation|review|news"
      },
      "competitiveComparison": {
        "comparedWith": ["marca1", "marca2"],
        "position": "better|worse|equal|not_compared",
        "reasoning": "Explicación de la comparación competitiva"
      }
    }
  ],
  "otherBrandsMentioned": [
    {
      "brand": "Nombre de marca NO en las listas configuradas",
      "mentioned": true,
      "frequency": número_de_menciones,
      "appearanceOrder": número (orden de aparición),
      "context": "positive|negative|neutral",
      "evidence": ["cita textual donde se menciona"],
      "isDiscovered": true
    }
  ],
  "competitiveAnalysis": {
    "targetBrandPosition": "Análisis de la posición de las marcas objetivo",
    "competitorComparisons": [
      {
        "competitor": "Nombre del competidor",
        "comparison": "Descripción de la comparación",
        "advantage": "target|competitor|neutral"
      }
    ]
  },
  "confidenceScore": 0.7-0.95
}

Responde ÚNICAMENTE con el JSON válido, sin texto adicional.`;
  }

  /**
   * Parsea respuesta mejorada con análisis contextual
   */
  private parseEnhancedAnalysisResponse(questionData: any, generatedContent: string, analysisResponse: string, modelPersona: AIModelPersona, configuration: any, webSources: WebSearchSource[] = []): MultiModelAnalysis {
    try {
      const cleanedResponse = this.cleanJSONResponse(analysisResponse);
      const parsed = JSON.parse(cleanedResponse);

      // Combinar marcas configuradas con marcas descubiertas
      const configuredBrands = (parsed.brandMentions || []).map((b: any) => ({
        ...b,
        isDiscovered: false
      }));

      const discoveredBrands = (parsed.otherBrandsMentioned || []).map((b: any) => ({
        ...b,
        isDiscovered: true
      }));

      const allBrandMentions = [...configuredBrands, ...discoveredBrands];

      // Log de marcas descubiertas
      if (discoveredBrands.length > 0) {
        console.log(`🔍 [${modelPersona}] Marcas descubiertas: ${discoveredBrands.map((b: any) => b.brand).join(', ')}`);
      }

      // Convertir webSources a SourceCited para compatibilidad
      const sourcesCited: SourceCited[] = webSources.map(source => ({
        name: source.title,
        type: this.classifySourceType(this.extractDomainFromUrl(source.url)) as any,
        url: source.url,
        context: source.snippet,
        credibility: this.calculateSourceCredibility(source.url) as any
      }));

      if (sourcesCited.length > 0) {
        console.log(`📖 [${modelPersona}] Fuentes citadas: ${sourcesCited.map(s => s.name).join(', ')}`);
      }

      return {
        modelPersona,
        response: generatedContent,
        brandMentions: allBrandMentions,
        sourcesCited: sourcesCited,
        overallSentiment: parsed.overallSentiment || 'neutral',
        contextualAnalysis: parsed.brandMentions?.map((brand: any) => brand.contextualAnalysis).filter(Boolean) || [],
        confidenceScore: parsed.confidenceScore || 0.75
      };
    } catch (error) {
      console.error(`🔴 Error parseando respuesta mejorada para ${modelPersona}:`, error);
      return {
        modelPersona,
        response: generatedContent,
        brandMentions: [],
        sourcesCited: [],
        overallSentiment: 'neutral',
        contextualAnalysis: [],
        confidenceScore: 0.5
      };
    }
  }

  /**
   * Consolida resultados de múltiples modelos
   */
  private consolidateMultiModelResults(questionData: any, multiModelResults: MultiModelAnalysis[], configuration: any): QuestionAnalysis {
    if (multiModelResults.length === 0) {
      console.warn(`⚠️ [${questionData.id}] No se pudo completar el análisis con ningún modelo, retornando análisis de error`);
      return this.createErrorAnalysis(questionData);
    }

    console.log(`📊 [${questionData.id}] Consolidando resultados de ${multiModelResults.length} modelo(s)`);


    // Consolidar menciones de marca de todos los modelos
    const allBrandMentions: BrandMention[] = [];
    const brandMap = new Map<string, BrandMention>();

    multiModelResults.forEach(modelResult => {
      modelResult.brandMentions.forEach(mention => {
        const key = mention.brand.toLowerCase();
        if (brandMap.has(key)) {
          const existing = brandMap.get(key)!;
          existing.frequency += mention.frequency;
          existing.evidence.push(...mention.evidence);
          if (mention.mentioned) existing.mentioned = true;
        } else {
          brandMap.set(key, { ...mention });
        }
      });
    });

    // Calcular sentimiento general y confianza promedio
    const overallSentiments = multiModelResults.map(r => r.overallSentiment);
    const avgConfidence = multiModelResults.reduce((sum, r) => sum + r.confidenceScore, 0) / multiModelResults.length;

    // Crear análisis competitivo consolidado
    const competitiveAnalysis = this.createCompetitiveAnalysis(multiModelResults, configuration);

    // Consolidar todas las respuestas en fullContent
    const allResponses = multiModelResults.map(r =>
      `=== ${r.modelPersona.toUpperCase()} ===\n\n${r.response}\n\n`
    ).join('\n');

    // Consolidar fuentes citadas de todos los modelos
    const allSourcesCited: SourceCited[] = [];
    multiModelResults.forEach(r => {
      if (r.sourcesCited && Array.isArray(r.sourcesCited)) {
        allSourcesCited.push(...r.sourcesCited);
      }
    });
    // Eliminar duplicados por nombre
    const uniqueSourcesCited = allSourcesCited.filter((source, index, self) =>
      index === self.findIndex(s => s.name.toLowerCase() === source.name.toLowerCase())
    );

    // Convertir sourcesCited a AnalysisSource para el frontend
    const webSourcesAsAnalysisSources: AnalysisSource[] = uniqueSourcesCited.map(source => ({
      url: source.url || '',
      title: source.name,
      snippet: source.context || '',
      domain: source.url ? this.extractDomainFromUrl(source.url) : 'unknown',
      isPriority: source.credibility === 'high'
    }));

    // Combinar respuesta IA + fuentes web reales
    const allSources: AnalysisSource[] = [
      {
        url: 'ai-generated',
        title: 'Respuestas generadas por IA',
        snippet: multiModelResults[0]?.response.substring(0, 2000) + '...',
        domain: 'ai-models',
        isPriority: true,
        fullContent: allResponses
      },
      ...webSourcesAsAnalysisSources
    ];

    console.log(`📊 Consolidación: ${brandMap.size} marcas, ${uniqueSourcesCited.length} fuentes web`);

    return {
      questionId: questionData.id,
      question: questionData.question,
      category: questionData.category || 'general',
      summary: `Análisis multi-modelo (${multiModelResults.map(r => r.modelPersona).join(', ')}) de respuestas de IA`,
      sources: allSources,
      brandMentions: Array.from(brandMap.values()),
      sourcesCited: uniqueSourcesCited,
      sentiment: this.calculateOverallSentiment(overallSentiments),
      confidenceScore: avgConfidence,
      multiModelAnalysis: multiModelResults,
      detailedSentiment: this.calculateDetailedSentiment(overallSentiments),
      contextualInsights: this.generateContextualInsights(multiModelResults),
      competitiveAnalysis
    };
  }

  /**
   * Crea análisis competitivo basado en múltiples modelos
   */
  private createCompetitiveAnalysis(multiModelResults: MultiModelAnalysis[], configuration: any): any {
    const targetBrands = configuration.targetBrands || (configuration.targetBrand ? [configuration.targetBrand] : TARGET_BRANDS);
    const competitors = configuration.competitorBrands || COMPETITOR_BRANDS;

    const competitorComparisons: any[] = [];
    
    // Analizar menciones de competidores
    competitors.forEach(competitor => {
      const mentions = multiModelResults.flatMap(r => 
        r.brandMentions.filter(m => m.brand.toLowerCase().includes(competitor.toLowerCase()))
      );
      
      if (mentions.length > 0) {
        const avgSentiment = mentions.reduce((sum, m) => {
          const sentimentScore = this.sentimentToScore(m.context as SentimentType);
          return sum + sentimentScore;
        }, 0) / mentions.length;

        competitorComparisons.push({
          competitor,
          comparison: `Mencionado ${mentions.length} veces con sentimiento promedio ${avgSentiment.toFixed(2)}`,
          advantage: avgSentiment > 0 ? 'competitor' : avgSentiment < 0 ? 'target' : 'neutral'
        });
      }
    });

    return {
      targetBrandPosition: `Análisis basado en ${multiModelResults.length} modelos de IA diferentes`,
      competitorComparisons
    };
  }

  /**
   * Consolida menciones de marca con análisis competitivo
   */
  private consolidateBrandMentionsWithCompetitiveAnalysis(analyses: QuestionAnalysis[], configuration: any): {
    targetBrands: BrandMention[];
    competitors: BrandMention[];
  } {
    const targetBrands = configuration.targetBrands || (configuration.targetBrand ? [configuration.targetBrand] : TARGET_BRANDS);
    const competitors = configuration.competitorBrands || COMPETITOR_BRANDS;

    const targetMap = new Map<string, BrandMention>();
    const competitorMap = new Map<string, BrandMention>();

    // Consolidar menciones de todas las preguntas
    analyses.forEach(analysis => {
      analysis.brandMentions.forEach(mention => {
        const brandLower = mention.brand.toLowerCase();
        const isTarget = targetBrands.some((brand: string) => brandLower.includes(brand.toLowerCase()));
        const map = isTarget ? targetMap : competitorMap;
        
        if (map.has(brandLower)) {
          const existing = map.get(brandLower)!;
          existing.frequency += mention.frequency;
          existing.evidence.push(...mention.evidence);
          if (mention.mentioned) existing.mentioned = true;
        } else {
          map.set(brandLower, { ...mention });
        }
      });
    });

    return {
      targetBrands: Array.from(targetMap.values()),
      competitors: Array.from(competitorMap.values())
    };
  }

  /**
   * Calcula sentimiento general basado en múltiples sentimientos
   */
  private calculateOverallSentiment(sentiments: DetailedSentiment[]): SentimentType {
    const sentimentScores = sentiments.map(s => this.detailedSentimentToScore(s));
    const avgScore = sentimentScores.reduce((sum, score) => sum + score, 0) / sentimentScores.length;
    
    if (avgScore > 0.3) return 'positive';
    if (avgScore < -0.3) return 'negative';
    return 'neutral';
  }

  /**
   * Calcula sentimiento detallado basado en múltiples sentimientos
   */
  private calculateDetailedSentiment(sentiments: DetailedSentiment[]): DetailedSentiment {
    const sentimentScores = sentiments.map(s => this.detailedSentimentToScore(s));
    const avgScore = sentimentScores.reduce((sum, score) => sum + score, 0) / sentimentScores.length;
    
    if (avgScore > 0.6) return 'very_positive';
    if (avgScore > 0.2) return 'positive';
    if (avgScore < -0.6) return 'very_negative';
    if (avgScore < -0.2) return 'negative';
    return 'neutral';
  }

  /**
   * Convierte sentimiento detallado a puntuación numérica
   */
  private detailedSentimentToScore(sentiment: DetailedSentiment): number {
    switch (sentiment) {
      case 'very_positive': return 1;
      case 'positive': return 0.5;
      case 'neutral': return 0;
      case 'negative': return -0.5;
      case 'very_negative': return -1;
      default: return 0;
    }
  }

  /**
   * Convierte sentimiento básico a puntuación numérica
   */
  private sentimentToScore(sentiment: SentimentType): number {
    switch (sentiment) {
      case 'positive': return 0.5;
      case 'negative': return -0.5;
      case 'neutral': return 0;
      default: return 0;
    }
  }

  /**
   * Genera insights contextuales basados en múltiples modelos
   */
  private generateContextualInsights(multiModelResults: MultiModelAnalysis[]): string {
    const modelCount = multiModelResults.length;
    const sentiments = multiModelResults.map(r => r.overallSentiment);
    const avgConfidence = multiModelResults.reduce((sum, r) => sum + r.confidenceScore, 0) / modelCount;

    return `Análisis basado en ${modelCount} modelos de IA diferentes. Sentimientos detectados: ${sentiments.join(', ')}. Confianza promedio: ${(avgConfidence * 100).toFixed(1)}%.`;
  }

  /**
   * Limpia respuesta JSON de caracteres problemáticos
   */
  private cleanJSONResponse(response: string): string {
    let cleanedResponse = response.trim();
    
    // Buscar el JSON entre ```json y ``` si existe
    const jsonCodeBlockMatch = cleanedResponse.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonCodeBlockMatch) {
      cleanedResponse = jsonCodeBlockMatch[1].trim();
    }
    
    // Buscar el JSON principal
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedResponse = jsonMatch[0];
    }
    
    return cleanedResponse
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export default OpenAIService;