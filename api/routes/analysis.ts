/**
 * Rutas para análisis de marca
 * Soporta multi-tenant: cada usuario ve solo sus análisis
 */
import { Router, Request, Response } from 'express';
import OpenAIService from '../services/openaiService.js';
import { QuestionCategory, getModelById } from '../config/constants.js';
import { databaseService } from '../services/databaseService.js';
import { excelService } from '../services/excelService.js';
import { pdfService } from '../services/pdfService.js';
import { requireAuth } from '../middleware/auth.js';
import { authService } from '../services/authService.js';
import { getQueueStats } from '../services/providerQueue.js';

const router = Router();
let openaiService: OpenAIService;

// ─── Job Queue en memoria ───────────────────────────────────────────
interface AnalysisJob {
  id: string;
  userId: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: { completed: number; total: number; percent: number };
  result?: any;
  error?: { error: string; code?: string; message?: string; provider?: string };
  createdAt: number;
}

const jobs = new Map<string, AnalysisJob>();

// Limpiar jobs completados/error después de 30 minutos
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if ((job.status === 'completed' || job.status === 'error') && now - job.createdAt > 30 * 60 * 1000) {
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1000);
// ────────────────────────────────────────────────────────────────────

// Requiere autenticación: cada usuario solo ve sus datos
router.use(requireAuth);

/**
 * POST /api/analysis/test-config
 * Endpoint de prueba para verificar la configuración de modelos y país
 * NO ejecuta análisis real, solo muestra qué modelos se usarían
 */
router.post('/test-config', async (req: Request, res: Response) => {
  try {
    const {
      selectedModel,
      countryCode,
      countryContext,
      countryLanguage
    } = req.body;

    // Determinar modelo de generación
    const openaiModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
    const generationModel = openaiModels.includes(selectedModel) ? selectedModel : 'gpt-4o';
    const analysisModel = 'gpt-4o-mini'; // Siempre fijo para análisis

    const testResult = {
      success: true,
      config: {
        selectedModel: selectedModel || 'no especificado',
        countryCode: countryCode || 'ES',
        countryContext: countryContext || 'en España',
        countryLanguage: countryLanguage || 'Español'
      },
      modelsToBeUsed: {
        generation: {
          model: generationModel,
          purpose: 'Generar respuestas simulando cómo respondería la IA a las preguntas del usuario',
          description: 'Este es el modelo que el usuario seleccionó para generar las respuestas'
        },
        analysis: {
          model: analysisModel,
          purpose: 'Analizar las respuestas generadas para detectar menciones de marca',
          description: 'Este modelo es fijo (económico) para reducir costos en el análisis'
        }
      },
      explanation: `FLUJO: 1) Generación con ${generationModel} (elegido por usuario) → 2) Análisis con ${analysisModel} (fijo económico). País: ${countryCode || 'ES'}`
    };

    console.log('\n📊 TEST DE CONFIGURACIÓN:');
    console.log(JSON.stringify(testResult, null, 2));

    res.json(testResult);

  } catch (error) {
    console.error('Error en test de configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error al verificar configuración'
    });
  }
});

/**
 * POST /api/analysis/execute-async
 * Encola el análisis y devuelve un jobId inmediatamente.
 * El cliente consulta el progreso con GET /api/analysis/job/:jobId
 */
router.post('/execute-async', async (req: Request, res: Response) => {
  try {
    const {
      categories,
      configuration,
      userApiKeys,
      projectId,
      selectedModel,
      countryCode,
      countryName,
      timezone,
      countryContext,
      countryLanguage
    } = req.body;

    // Obtener API keys del usuario
    let apiKeysToUse = userApiKeys;
    if (req.userId && !userApiKeys) {
      try {
        const storedKeys = await authService.getApiKeys(req.userId);
        if (Object.keys(storedKeys).length > 0) {
          apiKeysToUse = storedKeys;
        }
      } catch (err) {
        // silenciar
      }
    }

    if (!apiKeysToUse || (!apiKeysToUse.openai && !apiKeysToUse.anthropic && !apiKeysToUse.google)) {
      return res.status(400).json({ error: 'API Keys requeridas', code: 'API_KEYS_REQUIRED', message: 'Debes configurar tus API Keys en Configuración > API Keys antes de ejecutar análisis.' });
    }

    const modelInfo = getModelById(selectedModel || 'gpt-4o-search-preview');
    if (modelInfo) {
      const provider = modelInfo.provider;
      if (provider === 'openai' && !apiKeysToUse.openai) {
        return res.status(400).json({ error: 'API Key de OpenAI requerida', code: 'OPENAI_KEY_REQUIRED' });
      }
      if (provider === 'anthropic' && !apiKeysToUse.anthropic) {
        return res.status(400).json({ error: 'API Key de Anthropic requerida', code: 'ANTHROPIC_KEY_REQUIRED' });
      }
      if (provider === 'google' && !apiKeysToUse.google) {
        return res.status(400).json({ error: 'API Key de Google AI requerida', code: 'GOOGLE_KEY_REQUIRED' });
      }
    }

    if (!configuration || !configuration.name || !configuration.questions || configuration.questions.length === 0) {
      return res.status(400).json({ error: 'Configuración inválida', code: 'INVALID_CONFIG' });
    }

    // Crear job
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const job: AnalysisJob = {
      id: jobId,
      userId: req.userId!,
      status: 'pending',
      progress: { completed: 0, total: configuration.questions.length, percent: 0 },
      createdAt: Date.now(),
    };
    jobs.set(jobId, job);

    // Responder inmediatamente con el jobId
    res.json({ success: true, jobId, totalQuestions: configuration.questions.length });

    // Ejecutar análisis en background (fire-and-forget)
    (async () => {
      job.status = 'running';
      try {
        const service = new OpenAIService(apiKeysToUse);
        const isMultiModel = configuration.aiModels && Array.isArray(configuration.aiModels) && configuration.aiModels.length > 1;

        const extendedConfiguration = {
          ...configuration,
          selectedModel: selectedModel || 'gpt-4o-search-preview',
          countryCode: countryCode || 'ES',
          countryName: countryName || 'España',
          timezone: timezone || 'Europe/Madrid',
          countryContext: countryContext || 'en España, considerando el mercado español',
          countryLanguage: countryLanguage || 'Español'
        };

        const onProgress = (completed: number, total: number) => {
          job.progress = { completed, total, percent: Math.round((completed / total) * 100) };
        };

        let result;
        if (isMultiModel) {
          result = await service.executeMultiModelAnalysis(configuration.questions, extendedConfiguration, onProgress);
        } else {
          result = await service.executeAnalysisWithConfiguration(configuration.questions, extendedConfiguration, onProgress);
        }

        // Guardar en BD
        try {
          const analysisId = result.analysisId || `analysis_${Date.now()}`;
          await databaseService.saveAnalysis({
            id: analysisId,
            projectId: projectId || undefined,
            timestamp: new Date().toISOString(),
            configuration: {
              brand: configuration.targetBrand || configuration.name,
              competitors: configuration.competitorBrands || configuration.competitors || [],
              templateId: configuration.templateId || 'custom',
              questionsCount: configuration.questions.length
            },
            results: result,
            metadata: {
              duration: result.duration,
              modelsUsed: configuration.aiModels || ['chatgpt'],
              totalQuestions: configuration.questions.length
            }
          }, req.userId);
        } catch (saveError) {
          console.error('❌ Error al guardar análisis en BD:', saveError);
        }

        job.status = 'completed';
        job.progress = { completed: configuration.questions.length, total: configuration.questions.length, percent: 100 };
        job.result = {
          success: true,
          data: result,
          analysisType: isMultiModel ? 'multi-model' : 'standard',
          modelsUsed: configuration.aiModels || ['chatgpt']
        };

      } catch (error: any) {
        console.error('❌ Error en job de análisis:', error);
        job.status = 'error';

        if (error?.isAuthError || error?.status === 401 || error?.code === 'invalid_api_key') {
          job.error = { error: 'API Key inválida', code: 'INVALID_API_KEY', provider: error?.provider || 'openai', message: 'La API Key es incorrecta o ha expirado.' };
        } else if (error?.isQuotaError || error?.code === 'insufficient_quota' || error?.status === 429) {
          const provider = error?.provider || 'openai';
          const providerLabel = provider === 'anthropic' || provider === 'claude' ? 'Anthropic' : provider === 'google' || provider === 'gemini' ? 'Google AI' : 'OpenAI';
          job.error = {
            error: `Cuota de ${providerLabel} agotada`,
            code: 'QUOTA_EXCEEDED',
            provider,
            message: `Has agotado la cuota de tu API Key de ${providerLabel}. Revisa tu plan y facturación en el panel del proveedor, o configura otra API Key en Configuración > API Keys.`
          };
        } else {
          job.error = { error: 'Error ejecutando análisis', message: error instanceof Error ? error.message : 'Error desconocido' };
        }
      }
    })();

  } catch (error: any) {
    console.error('Error creando job de análisis:', error);
    res.status(500).json({ error: 'Error interno', message: error.message });
  }
});

/**
 * GET /api/analysis/job/:jobId
 * Consulta el estado/progreso de un análisis en ejecución
 */
router.get('/job/:jobId', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job no encontrado' });
  }

  // Solo el owner puede consultar su job
  if (job.userId !== req.userId) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const response: any = {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
  };

  if (job.status === 'completed') {
    response.result = job.result;
    // Limpiar el job una vez entregado el resultado
    jobs.delete(job.id);
  } else if (job.status === 'error') {
    response.error = job.error;
    jobs.delete(job.id);
  }

  res.json(response);
});

/**
 * GET /api/analysis/queue-stats
 * Devuelve el estado actual de las colas por proveedor (depth + inflight).
 * Útil para diagnóstico y monitorización.
 */
router.get('/queue-stats', (_req: Request, res: Response) => {
  const providers = getQueueStats();
  const activeJobs = Array.from(jobs.values()).filter(j => j.status === 'running' || j.status === 'pending').length;
  res.json({ providers, activeJobs });
});

/**
 * POST /api/analysis/execute
 * Ejecuta análisis de marca para las categorías seleccionadas
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const {
      categories,
      maxSources = 6,
      configuration,
      userApiKeys,
      projectId,
      // Parámetros de modelo y país (del dropdown del frontend)
      selectedModel,
      countryCode,
      countryName,
      timezone,
      countryContext,
      countryLanguage
    } = req.body;

    // Log de parámetros de modelo y país
    console.log('📊 Parámetros de análisis:');
    console.log(`   🤖 Modelo seleccionado: ${selectedModel || 'default'}`);
    console.log(`   🌍 País: ${countryCode || 'ES'}`);
    console.log(`   🗣️ Idioma: ${countryLanguage || 'Español'}`);

    // Obtener API keys del usuario autenticado si existen
    let apiKeysToUse = userApiKeys;
    if (req.userId && !userApiKeys) {
      try {
        const storedKeys = await authService.getApiKeys(req.userId);
        if (Object.keys(storedKeys).length > 0) {
          apiKeysToUse = storedKeys;
          console.log('🔑 Using stored API keys for user:', req.userId);
        }
      } catch (err) {
        console.log('⚠️ Could not retrieve stored API keys:', err);
      }
    }

    // VALIDACIÓN OBLIGATORIA: El usuario DEBE tener API keys configuradas
    if (!apiKeysToUse || (!apiKeysToUse.openai && !apiKeysToUse.anthropic && !apiKeysToUse.google)) {
      return res.status(400).json({
        error: 'API Keys requeridas',
        message: 'Debes configurar tus API Keys en Configuración > API Keys antes de ejecutar análisis.',
        code: 'API_KEYS_REQUIRED'
      });
    }

    // Validar que exista la API key del proveedor correspondiente al modelo seleccionado
    const modelInfo = getModelById(selectedModel || 'gpt-4o-search-preview');
    if (modelInfo) {
      const provider = modelInfo.provider;
      if (provider === 'openai' && !apiKeysToUse.openai) {
        return res.status(400).json({
          error: 'API Key de OpenAI requerida',
          message: 'Para usar modelos de OpenAI, configura tu API Key de OpenAI en Configuración > API Keys.',
          code: 'OPENAI_KEY_REQUIRED'
        });
      }
      if (provider === 'anthropic' && !apiKeysToUse.anthropic) {
        return res.status(400).json({
          error: 'API Key de Anthropic requerida',
          message: 'Para usar modelos Claude, configura tu API Key de Anthropic en Configuración > API Keys.',
          code: 'ANTHROPIC_KEY_REQUIRED'
        });
      }
      if (provider === 'google' && !apiKeysToUse.google) {
        return res.status(400).json({
          error: 'API Key de Google AI requerida',
          message: 'Para usar modelos Gemini, configura tu API Key de Google AI en Configuración > API Keys.',
          code: 'GOOGLE_KEY_REQUIRED'
        });
      }
    }

    // Crear servicio SOLO con keys del usuario (sin fallback a env)
    openaiService = new OpenAIService(apiKeysToUse);
    console.log('🔑 Using user-provided API keys');

    // Validar que se proporcione configuración
    if (!configuration) {
      return res.status(400).json({
        error: 'Se requiere una configuración para el análisis'
      });
    }

    // Validar configuración básica
    if (!configuration.name || !configuration.questions || !Array.isArray(configuration.questions)) {
      return res.status(400).json({
        error: 'La configuración debe incluir nombre y preguntas válidas'
      });
    }

    // Validar preguntas
    if (configuration.questions.length === 0) {
      return res.status(400).json({
        error: 'Se requiere al menos una pregunta para el análisis'
      });
    }

    // Determinar tipo de análisis basado en la configuración
    const isMultiModelAnalysis = configuration.aiModels && Array.isArray(configuration.aiModels) && configuration.aiModels.length > 1;
    
    console.log(`🚀 Iniciando análisis ${isMultiModelAnalysis ? 'multi-modelo' : 'estándar'}`);
    console.log(`📝 Preguntas: ${configuration.questions.length}`);
    console.log(`🤖 Modelos: ${configuration.aiModels?.join(', ') || 'ChatGPT'}`);

    // Extender la configuración con modelo y país (datos del dropdown del frontend)
    const extendedConfiguration = {
      ...configuration,
      selectedModel: selectedModel || 'gpt-4o-search-preview',
      countryCode: countryCode || 'ES',
      countryName: countryName || 'España',
      timezone: timezone || 'Europe/Madrid',
      countryContext: countryContext || 'en España, considerando el mercado español',
      countryLanguage: countryLanguage || 'Español'
    };

    let result;

    if (isMultiModelAnalysis) {
      // Ejecutar análisis multi-modelo con sentimientos y comparación
      result = await openaiService.executeMultiModelAnalysis(configuration.questions, extendedConfiguration);
    } else {
      // Ejecutar análisis estándar mejorado
      result = await openaiService.executeAnalysisWithConfiguration(configuration.questions, extendedConfiguration);
    }

    // Guardar análisis en base de datos
    try {
      const analysisId = result.analysisId || `analysis_${Date.now()}`;
      const savedAnalysis = {
        id: analysisId,
        projectId: projectId || undefined,
        timestamp: new Date().toISOString(),
        configuration: {
          name: configuration.name,
          brand: configuration.targetBrand || configuration.name,
          targetBrand: configuration.targetBrand || configuration.name,
          competitors: configuration.competitorBrands || configuration.competitors || [],
          competitorBrands: configuration.competitorBrands || configuration.competitors || [],
          industry: configuration.industry || 'General',
          templateId: configuration.templateId || 'custom',
          questionsCount: configuration.questions.length
        },
        results: result,
        metadata: {
          duration: result.duration,
          modelsUsed: configuration.aiModels || ['chatgpt'],
          totalQuestions: configuration.questions.length
        }
      };

      await databaseService.saveAnalysis(savedAnalysis, req.userId);
      console.log(`✅ Análisis guardado en base de datos con ID: ${analysisId}${projectId ? ` (Proyecto: ${projectId})` : ''}${req.userId ? ` (Usuario: ${req.userId})` : ''}`);
    } catch (saveError) {
      console.error('❌ Error al guardar análisis en base de datos:', saveError);
      // No detenemos la respuesta si falla el guardado
    }

    res.json({
      success: true,
      data: result,
      analysisType: isMultiModelAnalysis ? 'multi-model' : 'standard',
      modelsUsed: configuration.aiModels || ['chatgpt']
    });

  } catch (error: any) {
    console.error('Error ejecutando análisis:', error);

    const providerNames: Record<string, string> = {
      chatgpt: 'OpenAI',
      openai: 'OpenAI',
      claude: 'Anthropic',
      anthropic: 'Anthropic',
      gemini: 'Google AI',
      google: 'Google AI'
    };

    // Detectar errores de API key inválida
    if (error?.isAuthError || error?.message?.startsWith('API_KEY_INVALID:') || error?.status === 401 || error?.code === 'invalid_api_key') {
      const provider = error?.provider || 'openai';
      const providerName = providerNames[provider] || provider;
      return res.status(401).json({
        error: `API Key de ${providerName} inválida`,
        message: `La API Key de ${providerName} que configuraste es incorrecta o ha expirado. Ve a Configuración > API Keys y verifica que la key sea válida.`,
        code: 'INVALID_API_KEY',
        provider: provider
      });
    }

    // Detectar errores de cuota agotada
    if (error?.isQuotaError || error?.message?.startsWith('API_QUOTA_EXCEEDED:') || error?.code === 'insufficient_quota' || error?.status === 429) {
      const provider = error?.provider || 'openai';
      const providerName = providerNames[provider] || 'OpenAI';
      return res.status(402).json({
        error: `Cuota de ${providerName} agotada`,
        message: `Has agotado la cuota de tu API Key de ${providerName}. Revisa tu plan y facturación en el panel del proveedor, o configura otra API Key en Configuración > API Keys.`,
        code: 'QUOTA_EXCEEDED',
        provider: provider
      });
    }

    res.status(500).json({
      error: 'Error ejecutando análisis',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

/**
 * POST /api/analysis/multi-model
 * Ejecuta análisis específicamente con múltiples modelos de IA
 */
router.post('/multi-model', async (req: Request, res: Response) => {
  try {
    const { questions, configuration, userApiKeys, projectId } = req.body;

    // Obtener API keys del usuario autenticado si existen
    let apiKeysToUse = userApiKeys;
    if (req.userId && !userApiKeys) {
      try {
        const storedKeys = await authService.getApiKeys(req.userId);
        if (Object.keys(storedKeys).length > 0) {
          apiKeysToUse = storedKeys;
        }
      } catch (err) {
        console.log('⚠️ Could not retrieve stored API keys:', err);
      }
    }

    // VALIDACIÓN OBLIGATORIA: El usuario DEBE tener API keys configuradas
    if (!apiKeysToUse || (!apiKeysToUse.openai && !apiKeysToUse.anthropic && !apiKeysToUse.google)) {
      return res.status(400).json({
        error: 'API Keys requeridas',
        message: 'Debes configurar tus API Keys en Configuración > API Keys antes de ejecutar análisis multi-modelo.',
        code: 'API_KEYS_REQUIRED'
      });
    }

    // Validar API keys según los modelos configurados en el análisis multi-modelo
    const aiModels = configuration?.aiModels || ['chatgpt', 'claude', 'gemini'];
    const needsOpenAI = aiModels.some((m: string) => m === 'chatgpt' || m.includes('gpt'));
    const needsAnthropic = aiModels.some((m: string) => m === 'claude');
    const needsGoogle = aiModels.some((m: string) => m === 'gemini');

    if (needsOpenAI && !apiKeysToUse.openai) {
      return res.status(400).json({
        error: 'API Key de OpenAI requerida',
        message: 'Para usar modelos ChatGPT en análisis multi-modelo, configura tu API Key de OpenAI en Configuración > API Keys.',
        code: 'OPENAI_KEY_REQUIRED'
      });
    }
    if (needsAnthropic && !apiKeysToUse.anthropic) {
      return res.status(400).json({
        error: 'API Key de Anthropic requerida',
        message: 'Para usar modelos Claude en análisis multi-modelo, configura tu API Key de Anthropic en Configuración > API Keys.',
        code: 'ANTHROPIC_KEY_REQUIRED'
      });
    }
    if (needsGoogle && !apiKeysToUse.google) {
      return res.status(400).json({
        error: 'API Key de Google AI requerida',
        message: 'Para usar modelos Gemini en análisis multi-modelo, configura tu API Key de Google AI en Configuración > API Keys.',
        code: 'GOOGLE_KEY_REQUIRED'
      });
    }

    // Crear servicio SOLO con keys del usuario (sin fallback a env)
    openaiService = new OpenAIService(apiKeysToUse);
    console.log('🔑 Using user-provided API keys for multi-model');

    // Validar entrada
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        error: 'Se requieren preguntas válidas para el análisis'
      });
    }

    if (!configuration) {
      return res.status(400).json({
        error: 'Se requiere configuración para el análisis'
      });
    }

    // Asegurar que hay múltiples modelos configurados
    if (!configuration.aiModels || !Array.isArray(configuration.aiModels)) {
      configuration.aiModels = ['chatgpt', 'claude', 'gemini'];
    }

    console.log(`🤖 Ejecutando análisis multi-modelo con: ${configuration.aiModels.join(', ')}`);

    const result = await openaiService.executeMultiModelAnalysis(questions, configuration);

    // Guardar análisis en base de datos
    try {
      const analysisId = result.analysisId || `analysis_${Date.now()}`;
      const savedAnalysis = {
        id: analysisId,
        projectId: projectId || undefined,
        timestamp: new Date().toISOString(),
        configuration: {
          name: configuration.name,
          brand: configuration.targetBrand || configuration.name,
          competitors: configuration.competitors || [],
          templateId: configuration.templateId || 'custom',
          questionsCount: questions.length
        },
        results: result,
        metadata: {
          modelsUsed: configuration.aiModels,
          totalQuestions: questions.length
        }
      };

      await databaseService.saveAnalysis(savedAnalysis, req.userId);
      console.log(`✅ Análisis multi-modelo guardado en base de datos con ID: ${analysisId}${projectId ? ` (Proyecto: ${projectId})` : ''}${req.userId ? ` (Usuario: ${req.userId})` : ''}`);
    } catch (saveError) {
      console.error('❌ Error al guardar análisis multi-modelo en base de datos:', saveError);
      // No detenemos la respuesta si falla el guardado
    }

    res.json({
      success: true,
      data: result,
      analysisType: 'multi-model',
      modelsUsed: configuration.aiModels,
      enhancedFeatures: {
        sentimentAnalysis: true,
        competitiveComparison: true,
        contextualAnalysis: true,
        multiModelComparison: true
      }
    });

  } catch (error: any) {
    console.error('Error en análisis multi-modelo:', error);

    const providerNames: Record<string, string> = {
      chatgpt: 'OpenAI', openai: 'OpenAI',
      claude: 'Anthropic', anthropic: 'Anthropic',
      gemini: 'Google AI', google: 'Google AI'
    };

    if (error?.isAuthError || error?.message?.startsWith('API_KEY_INVALID:') || error?.status === 401 || error?.code === 'invalid_api_key') {
      const provider = error?.provider || 'openai';
      const providerName = providerNames[provider] || provider;
      return res.status(401).json({
        error: `API Key de ${providerName} inválida`,
        message: `La API Key de ${providerName} que configuraste es incorrecta o ha expirado. Ve a Configuración > API Keys y verifica que la key sea válida.`,
        code: 'INVALID_API_KEY',
        provider
      });
    }

    if (error?.isQuotaError || error?.message?.startsWith('API_QUOTA_EXCEEDED:') || error?.code === 'insufficient_quota' || error?.status === 429) {
      const provider = error?.provider || 'openai';
      const providerName = providerNames[provider] || 'OpenAI';
      return res.status(402).json({
        error: `Cuota de ${providerName} agotada`,
        message: `Has agotado la cuota de tu API Key de ${providerName}. Revisa tu plan y facturación en el panel del proveedor, o configura otra API Key en Configuración > API Keys.`,
        code: 'QUOTA_EXCEEDED',
        provider
      });
    }

    res.status(500).json({
      error: 'Error ejecutando análisis multi-modelo',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

/**
 * POST /api/analysis/report/markdown
 * Genera informe en formato Markdown
 */
router.post('/report/markdown', async (req: Request, res: Response) => {
try {
// Initialize OpenAI service if not already done
if (!openaiService) {
openaiService = new OpenAIService();
}

const { analysisResult, configuration } = req.body;

if (!analysisResult) {
return res.status(400).json({
error: 'Se requiere el resultado del análisis'
});
}

const markdown = openaiService.generateMarkdownReport(analysisResult, configuration);

res.json({
success: true,
data: {
format: 'markdown',
content: markdown,
filename: `analisis_${analysisResult.analysisId}.md`
}
});

} catch (error) {
console.error('Error generando informe Markdown:', error);
res.status(500).json({
error: 'Error generando informe Markdown',
message: error instanceof Error ? error.message : 'Error desconocido'
});
}
});

/**
 * POST /api/analysis/report/json
 * Genera informe en formato JSON
 */
router.post('/report/json', async (req: Request, res: Response) => {
try {
// Initialize OpenAI service if not already done
if (!openaiService) {
openaiService = new OpenAIService();
}

const { analysisResult } = req.body;

if (!analysisResult) {
return res.status(400).json({
error: 'Se requiere el resultado del análisis'
});
}

const jsonReport = openaiService.generateJSONReport(analysisResult);

res.json({
success: true,
data: {
format: 'json',
content: jsonReport,
filename: `analisis_${analysisResult.analysisId}.json`
}
});

} catch (error) {
console.error('Error generando informe JSON:', error);
res.status(500).json({
error: 'Error generando informe JSON',
message: error instanceof Error ? error.message : 'Error desconocido'
});
}
});

/**
 * POST /api/analysis/report/table
 * Genera informe en formato tabla (CSV)
 */
router.post('/report/table', async (req: Request, res: Response) => {
try {
// Initialize OpenAI service if not already done
if (!openaiService) {
openaiService = new OpenAIService();
}

const { analysisResult, configuration } = req.body;

if (!analysisResult) {
return res.status(400).json({
error: 'Se requiere el resultado del análisis'
});
}

const tableReport = openaiService.generateTableReport(analysisResult, configuration);

res.json({
success: true,
data: {
format: 'csv',
content: tableReport,
filename: `analisis_tabla_${analysisResult.analysisId}.csv`
}
});

} catch (error) {
console.error('Error generando informe en tabla:', error);
res.status(500).json({
error: 'Error generando informe en tabla',
message: error instanceof Error ? error.message : 'Error desconocido'
});
}
});

/**
 * POST /api/analysis/report/excel
 * Genera un informe avanzado en formato Excel con múltiples hojas
 */
router.post('/report/excel', async (req: Request, res: Response) => {
try {
const { analysisResult, configuration } = req.body;

if (!analysisResult) {
return res.status(400).json({
error: 'Se requiere analysisResult para generar el informe Excel'
});
}

// Generar archivo Excel
const excelBuffer = await excelService.generateAdvancedExcelReport(analysisResult, configuration);

// Nombre del archivo
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filename = `analisis_excel_${analysisResult.analysisId || timestamp}.xlsx`;

// Enviar el archivo como respuesta
res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
res.send(excelBuffer);

} catch (error) {
console.error('Error generando informe Excel:', error);
res.status(500).json({
error: 'Error generando informe Excel',
message: error instanceof Error ? error.message : 'Error desconocido'
});
}
});

/**
 * POST /api/analysis/report/pdf
 * Genera un informe profesional en formato PDF
 */
router.post('/report/pdf', async (req: Request, res: Response) => {
  try {
    const { analysisResult, configuration } = req.body;

    if (!analysisResult) {
      return res.status(400).json({
        error: 'Se requiere analysisResult para generar el informe PDF'
      });
    }

    console.log('📄 Generando informe PDF profesional...');

    // Generar PDF
    const pdfBuffer = await pdfService.generateAnalysisPDF(analysisResult, configuration || {
      name: 'Análisis',
      targetBrand: analysisResult.brandSummary?.targetBrands?.[0]?.brand || 'Marca',
      competitorBrands: analysisResult.brandSummary?.competitors?.map((c: any) => c.brand) || [],
      industry: 'General'
    });

    // Nombre del archivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `informe_analisis_${analysisResult.analysisId || timestamp}.pdf`;

    console.log(`✅ PDF generado: ${filename} (${pdfBuffer.length} bytes)`);

    // Enviar el archivo como respuesta
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generando informe PDF:', error);
    res.status(500).json({
      error: 'Error generando informe PDF',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

/**
 * GET /api/analysis/history
 * Obtiene el historial de análisis realizados (filtrado por proyecto y usuario)
 */
router.get('/history', async (req: Request, res: Response) => {
try {
const limit = parseInt(req.query.limit as string) || 50;
const projectId = req.query.projectId as string | undefined;
const analyses = await databaseService.getAllAnalyses(limit, projectId, req.userId);

// Transformar los datos al formato esperado por el frontend
const history = analyses.map(analysis => ({
id: analysis.id,
timestamp: analysis.timestamp,
targetBrand: analysis.configuration.brand,
configurationName: `Análisis ${analysis.configuration.brand}`,
templateUsed: analysis.configuration.templateId,
status: 'completed',
categories: analysis.results.questions?.map((q: any) => q.category) || [],
summary: `Análisis de ${analysis.configuration.brand} con ${analysis.configuration.questionsCount} preguntas`,
overallConfidence: analysis.results.overallConfidence || 0.8,
modelsUsed: analysis.metadata?.modelsUsed || ['chatgpt'],
questionsCount: analysis.configuration.questionsCount
}));

res.json({
success: true,
data: history
});

} catch (error) {
console.error('Error obteniendo historial:', error);
res.status(500).json({
error: 'Error obteniendo historial',
message: error instanceof Error ? error.message : 'Error desconocido'
});
}
});

/**
 * GET /api/analysis/categories
 * Obtiene las categorías disponibles y sus preguntas
 */
router.get('/categories', (req: Request, res: Response) => {
try {
const categories = {
hogar: {
name: 'Seguros de Hogar',
description: 'Análisis específico para seguros de hogar y vivienda',
questionCount: 4
},
alquiler_vacacional: {
name: 'Alquiler Vacacional',
description: 'Análisis para seguros de alquiler vacacional y turístico',
questionCount: 3
},
marca_confianza: {
name: 'Marca y Confianza',
description: 'Análisis de percepción de marca y confianza del consumidor',
questionCount: 3
}
};

res.json({
success: true,
data: categories
});

} catch (error) {
console.error('Error obteniendo categorías:', error);
res.status(500).json({
error: 'Error obteniendo categorías',
message: error instanceof Error ? error.message : 'Error desconocido'
});
}
});

/**
 * GET /api/analysis/saved
 * Obtiene análisis guardados desde la base de datos
 */
router.get('/saved', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const brand = req.query.brand as string;
    const projectId = req.query.projectId as string | undefined;

    let analyses;
    if (brand) {
      analyses = await databaseService.getAnalysesByBrand(brand, req.userId);
    } else {
      analyses = await databaseService.getAllAnalyses(limit, projectId, req.userId);
    }

    // Transformar los datos al formato esperado por el frontend
    const savedAnalyses = analyses.map(analysis => ({
      id: analysis.id,
      projectId: analysis.projectId,
      timestamp: analysis.timestamp,
      targetBrand: analysis.configuration.brand,
      configurationName: `Análisis ${analysis.configuration.brand}`,
      templateUsed: analysis.configuration.templateId,
      status: 'completed',
      categories: analysis.results.questions?.map((q: any) => q.category) || [],
      summary: `Análisis de ${analysis.configuration.brand} con ${analysis.configuration.questionsCount} preguntas`,
      overallConfidence: analysis.results.overallConfidence || 0.8,
      modelsUsed: analysis.metadata?.modelsUsed || ['chatgpt'],
      questionsCount: analysis.configuration.questionsCount
    }));

    res.json({
      success: true,
      data: savedAnalyses,
      count: savedAnalyses.length
    });

  } catch (error) {
    console.error('Error obteniendo análisis guardados:', error);
    res.status(500).json({
      error: 'Error obteniendo análisis guardados',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

/**
 * GET /api/analysis/saved/:id
 * Obtiene un análisis específico por ID
 */
router.get('/saved/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const analysis = await databaseService.getAnalysis(id, req.userId);

    if (!analysis) {
      return res.status(404).json({
        error: 'Análisis no encontrado',
        message: `No se encontró un análisis con ID: ${id}`
      });
    }

    res.json({
      success: true,
      data: analysis
    });

  } catch (error) {
    console.error('Error obteniendo análisis:', error);
    res.status(500).json({
      error: 'Error obteniendo análisis',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

/**
 * DELETE /api/analysis/saved/:id
 * Elimina un análisis por ID
 */
router.delete('/saved/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const analysis = await databaseService.getAnalysis(id, req.userId);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: 'Análisis no encontrado',
        message: `No se encontró un análisis con ID: ${id}`
      });
    }

    await databaseService.deleteAnalysis(id, req.userId);

    res.json({
      success: true,
      message: 'Análisis eliminado correctamente'
    });

  } catch (error) {
    console.error('Error eliminando análisis:', error);
    res.status(500).json({
      success: false,
      error: 'Error eliminando análisis',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

/**
 * PATCH /api/analysis/saved/:id/config
 * Actualiza la configuración de un análisis existente
 */
router.patch('/saved/:id/config', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const configUpdates = req.body;

    await databaseService.updateAnalysisConfiguration(id, configUpdates, req.userId);

    res.json({
      success: true,
      message: 'Configuración actualizada correctamente'
    });

  } catch (error) {
    console.error('Error actualizando configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error actualizando configuración',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

export default router;