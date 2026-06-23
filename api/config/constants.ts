/**
 * Constantes de configuración para el análisis de marca
 */

// ==========================================
// MODELOS DE IA DISPONIBLES
// ==========================================

export interface AIModelInfo {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'openrouter';
  description: string;
  strengths: string[];
  contextWindow: string;
  pricing: string;
  recommended?: boolean;
  requiresApiKey: string;
  /**
   * Indica si el modelo tiene búsqueda web. Hasta ahora se infería por
   * id.includes('search'); para OpenRouter (sufijo ':online' / Perplexity Sonar)
   * lo marcamos explícitamente.
   */
  supportsWebSearch?: boolean;
}

export const AI_MODELS: AIModelInfo[] = [
  // =====================================================
  // OPENAI - SOLO MODELOS CON BÚSQUEDA WEB (Fuentes reales)
  // =====================================================
  {
    id: 'gpt-4o-search-preview',
    name: 'GPT-4o Search',
    provider: 'openai',
    description: 'Modelo con búsqueda web integrada. Devuelve fuentes REALES y verificables.',
    strengths: ['🌐 Búsqueda web real', '📚 Fuentes verificables', '🕐 Info actualizada', '✅ URLs reales'],
    contextWindow: '128K tokens',
    pricing: '$2.50 / $10 + $30 por 1K búsquedas',
    recommended: true,
    requiresApiKey: 'OPENAI_API_KEY'
  },
  {
    id: 'gpt-4o-mini-search-preview',
    name: 'GPT-4o Mini Search (Económico)',
    provider: 'openai',
    description: 'Versión económica con búsqueda web. Fuentes reales a menor costo.',
    strengths: ['🌐 Búsqueda web real', '💰 Más económico', '📚 Fuentes verificables', '⚡ Rápido'],
    contextWindow: '128K tokens',
    pricing: '$0.15 / $0.60 + $25 por 1K búsquedas',
    recommended: true,
    requiresApiKey: 'OPENAI_API_KEY'
  },

  // =====================================================
  // ANTHROPIC & GOOGLE - Para implementar después
  // =====================================================
  // Anthropic Claude Models
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    description: 'El modelo más capaz de Anthropic para coding y agentes. Excelente razonamiento.',
    strengths: ['Mejor para código', 'Razonamiento profundo', 'Respuestas estructuradas', 'Contexto 1M'],
    contextWindow: '200K tokens (1M con beta)',
    pricing: '$3 / $15 por 1M tokens',
    recommended: true,
    requiresApiKey: 'ANTHROPIC_API_KEY'
  },
  {
    id: 'claude-opus-4-1-20250805',
    name: 'Claude Opus 4.1',
    provider: 'anthropic',
    description: 'Modelo flagship de Anthropic. Máxima calidad para tareas complejas.',
    strengths: ['Máxima calidad', 'Tareas complejas', 'Análisis profundo'],
    contextWindow: '200K tokens',
    pricing: '$15 / $75 por 1M tokens',
    requiresApiKey: 'ANTHROPIC_API_KEY'
  },
  {
    id: 'claude-haiku-4-5-20251015',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: 'Modelo rápido y económico de Claude. Ideal para respuestas rápidas.',
    strengths: ['Muy rápido', 'Económico', 'Baja latencia'],
    contextWindow: '200K tokens',
    pricing: '$1 / $5 por 1M tokens',
    requiresApiKey: 'ANTHROPIC_API_KEY'
  },

  // Google Gemini Models
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    description: 'Modelo más potente de Google con razonamiento adaptivo y "Deep Think".',
    strengths: ['Razonamiento adaptivo', 'Excelente en matemáticas', 'Multimodal'],
    contextWindow: '1M tokens',
    pricing: 'Competitivo',
    recommended: true,
    requiresApiKey: 'GOOGLE_AI_API_KEY'
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    description: 'Modelo rápido y estable de Google. Buen balance velocidad/calidad.',
    strengths: ['Rápido', 'Estable', 'Multimodal'],
    contextWindow: '1M tokens',
    pricing: 'Económico',
    requiresApiKey: 'GOOGLE_AI_API_KEY'
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    description: 'Modelo con herramientas nativas y contexto extenso.',
    strengths: ['Herramientas nativas', 'Contexto 1M', 'Velocidad'],
    contextWindow: '1M tokens',
    pricing: 'Económico',
    requiresApiKey: 'GOOGLE_AI_API_KEY'
  }
] as const;

// ==========================================
// PAÍSES DISPONIBLES PARA ANÁLISIS
// ==========================================

export interface CountryInfo {
  code: string;
  name: string;
  flag: string;
  language: string;
  locale: string;
  timezone: string;
  description: string;
  marketContext: string;
}

export const COUNTRIES: CountryInfo[] = [
  {
    code: 'ES',
    name: 'España',
    flag: '🇪🇸',
    language: 'Español',
    locale: 'es-ES',
    timezone: 'Europe/Madrid',
    description: 'Mercado español. Las preguntas se contextualizarán para el mercado ibérico.',
    marketContext: 'en España, considerando el mercado español y las empresas que operan en el territorio nacional'
  },
  {
    code: 'MX',
    name: 'México',
    flag: '🇲🇽',
    language: 'Español',
    locale: 'es-MX',
    timezone: 'America/Mexico_City',
    description: 'Mercado mexicano. Análisis enfocado en el mercado latinoamericano más grande.',
    marketContext: 'en México, considerando el mercado mexicano y las empresas que operan en territorio nacional'
  },
  {
    code: 'AR',
    name: 'Argentina',
    flag: '🇦🇷',
    language: 'Español',
    locale: 'es-AR',
    timezone: 'America/Buenos_Aires',
    description: 'Mercado argentino. Contexto del Cono Sur.',
    marketContext: 'en Argentina, considerando el mercado argentino y las empresas que operan en el país'
  },
  {
    code: 'CO',
    name: 'Colombia',
    flag: '🇨🇴',
    language: 'Español',
    locale: 'es-CO',
    timezone: 'America/Bogota',
    description: 'Mercado colombiano. Hub de negocios en la región andina.',
    marketContext: 'en Colombia, considerando el mercado colombiano y las empresas que operan en el país'
  },
  {
    code: 'CL',
    name: 'Chile',
    flag: '🇨🇱',
    language: 'Español',
    locale: 'es-CL',
    timezone: 'America/Santiago',
    description: 'Mercado chileno. Economía estable y desarrollada de Latinoamérica.',
    marketContext: 'en Chile, considerando el mercado chileno y las empresas que operan en el país'
  },
  {
    code: 'PE',
    name: 'Perú',
    flag: '🇵🇪',
    language: 'Español',
    locale: 'es-PE',
    timezone: 'America/Lima',
    description: 'Mercado peruano. Economía en crecimiento.',
    marketContext: 'en Perú, considerando el mercado peruano y las empresas que operan en el país'
  },
  {
    code: 'EC',
    name: 'Ecuador',
    flag: '🇪🇨',
    language: 'Español',
    locale: 'es-EC',
    timezone: 'America/Guayaquil',
    description: 'Mercado ecuatoriano. Economía dolarizada con sectores en expansión.',
    marketContext: 'en Ecuador, considerando el mercado ecuatoriano y las empresas que operan en el país'
  },
  {
    code: 'US',
    name: 'Estados Unidos',
    flag: '🇺🇸',
    language: 'Inglés',
    locale: 'en-US',
    timezone: 'America/New_York',
    description: 'Mercado estadounidense. El mercado más grande del mundo.',
    marketContext: 'in the United States, considering the American market and companies operating in the country'
  },
  {
    code: 'US-ES',
    name: 'Estados Unidos (Hispano)',
    flag: '🇺🇸',
    language: 'Español',
    locale: 'es-US',
    timezone: 'America/New_York',
    description: 'Mercado hispano en EE.UU. Más de 60 millones de hispanohablantes.',
    marketContext: 'en Estados Unidos para el mercado hispano, considerando las preferencias de la comunidad latina'
  },
  {
    code: 'BR',
    name: 'Brasil',
    flag: '🇧🇷',
    language: 'Portugués',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    description: 'Mercado brasileño. El mayor mercado de Latinoamérica.',
    marketContext: 'no Brasil, considerando o mercado brasileiro e as empresas que operam no país'
  },
  {
    code: 'PT',
    name: 'Portugal',
    flag: '🇵🇹',
    language: 'Portugués',
    locale: 'pt-PT',
    timezone: 'Europe/Lisbon',
    description: 'Mercado portugués. Conexión con mercado ibérico y lusófono.',
    marketContext: 'em Portugal, considerando o mercado português e as empresas que operam no país'
  },
  {
    code: 'GB',
    name: 'Reino Unido',
    flag: '🇬🇧',
    language: 'Inglés',
    locale: 'en-GB',
    timezone: 'Europe/London',
    description: 'Mercado británico. Uno de los mercados financieros más importantes.',
    marketContext: 'in the United Kingdom, considering the British market and companies operating in the country'
  },
  {
    code: 'DE',
    name: 'Alemania',
    flag: '🇩🇪',
    language: 'Alemán',
    locale: 'de-DE',
    timezone: 'Europe/Berlin',
    description: 'Mercado alemán. La economía más grande de Europa.',
    marketContext: 'in Deutschland, unter Berücksichtigung des deutschen Marktes und der im Land tätigen Unternehmen'
  },
  {
    code: 'FR',
    name: 'Francia',
    flag: '🇫🇷',
    language: 'Francés',
    locale: 'fr-FR',
    timezone: 'Europe/Paris',
    description: 'Mercado francés. Segunda economía de la Eurozona.',
    marketContext: 'en France, en considérant le marché français et les entreprises opérant dans le pays'
  },
  {
    code: 'IT',
    name: 'Italia',
    flag: '🇮🇹',
    language: 'Italiano',
    locale: 'it-IT',
    timezone: 'Europe/Rome',
    description: 'Mercado italiano. Importante economía del sur de Europa.',
    marketContext: 'in Italia, considerando il mercato italiano e le aziende che operano nel paese'
  },
  {
    code: 'LATAM',
    name: 'Latinoamérica (General)',
    flag: '🌎',
    language: 'Español',
    locale: 'es-419',
    timezone: 'America/Mexico_City',
    description: 'Análisis general para toda Latinoamérica. Visión regional.',
    marketContext: 'en Latinoamérica, considerando el mercado latinoamericano en general y las empresas que operan en la región'
  },
  {
    code: 'GLOBAL',
    name: 'Global',
    flag: '🌍',
    language: 'Inglés',
    locale: 'en',
    timezone: 'UTC',
    description: 'Análisis global sin contexto geográfico específico.',
    marketContext: 'globally, considering international markets and multinational companies'
  }
] as const;

// =====================================================
// OPENROUTER - Una sola API key, acceso a todos los modelos.
// Todos llevan búsqueda web (sufijo ':online' / plugin web) salvo que
// el modelo sea "online" de forma nativa (Perplexity Sonar).
//
// ⚠️ Los slugs de OpenRouter cambian con frecuencia. Verifícalos en
//    https://openrouter.ai/models y actualízalos aquí. El "modo avanzado"
//    del dropdown permite pegar cualquier model-id, así que esta lista es
//    solo el atajo curado de los modelos recomendados.
// =====================================================
export const OPENROUTER_MODELS: AIModelInfo[] = [
  {
    id: 'openai/gpt-5.5:online',
    name: 'ChatGPT (GPT-5.5) + Search',
    provider: 'openrouter',
    description: 'Último GPT de OpenAI vía OpenRouter con búsqueda web (plugin :online).',
    strengths: ['🌐 Búsqueda web', '🧠 Último GPT', '📚 Citaciones', '✅ URLs reales'],
    contextWindow: '400K tokens',
    pricing: 'Según OpenRouter',
    recommended: true,
    requiresApiKey: 'OPENROUTER_API_KEY',
    supportsWebSearch: true,
  },
  {
    id: 'anthropic/claude-sonnet-4.6:online',
    name: 'Claude Sonnet 4.6 + Search',
    provider: 'openrouter',
    description: 'Claude Sonnet con búsqueda web vía OpenRouter (la integración directa de Claude no tiene search).',
    strengths: ['🌐 Búsqueda web', '🧠 Razonamiento', '📚 Citaciones'],
    contextWindow: '200K tokens',
    pricing: 'Según OpenRouter',
    recommended: true,
    requiresApiKey: 'OPENROUTER_API_KEY',
    supportsWebSearch: true,
  },
  {
    id: 'google/gemini-3.5-flash:online',
    name: 'Gemini 3.5 Flash + Search',
    provider: 'openrouter',
    description: 'Gemini de Google vía OpenRouter con búsqueda web. (Para Gemini Pro usa el modo avanzado con el slug exacto de openrouter.ai/models.)',
    strengths: ['🌐 Búsqueda web', '🧠 Multimodal', '📚 Citaciones', '⚡ Rápido'],
    contextWindow: '1M tokens',
    pricing: 'Según OpenRouter',
    recommended: true,
    requiresApiKey: 'OPENROUTER_API_KEY',
    supportsWebSearch: true,
  },
  {
    id: 'perplexity/sonar-pro',
    name: 'Perplexity Sonar Pro',
    provider: 'openrouter',
    description: 'Perplexity Sonar Pro: búsqueda online nativa con citaciones.',
    strengths: ['🌐 Búsqueda online nativa', '📚 Citaciones', '🕐 Info actualizada'],
    contextWindow: '200K tokens',
    pricing: 'Según OpenRouter',
    recommended: true,
    requiresApiKey: 'OPENROUTER_API_KEY',
    supportsWebSearch: true,
  },
  {
    id: 'perplexity/sonar-reasoning-pro',
    name: 'Perplexity Sonar Reasoning Pro',
    provider: 'openrouter',
    description: 'Perplexity Sonar con razonamiento y búsqueda online nativa.',
    strengths: ['🌐 Búsqueda online nativa', '🧠 Razonamiento', '📚 Citaciones'],
    contextWindow: '128K tokens',
    pricing: 'Según OpenRouter',
    requiresApiKey: 'OPENROUTER_API_KEY',
    supportsWebSearch: true,
  },
];

/**
 * Construye un AIModelInfo sintético para un model-id arbitrario de OpenRouter
 * (modo avanzado: el usuario pega el slug). La búsqueda web se asume si el id
 * termina en ':online' o es un modelo Perplexity Sonar (online nativo).
 */
export const buildAdHocOpenRouterModel = (modelId: string): AIModelInfo => {
  const isOnline = modelId.endsWith(':online') || /perplexity\/.*sonar/i.test(modelId);
  return {
    id: modelId,
    name: modelId,
    provider: 'openrouter',
    description: 'Modelo personalizado de OpenRouter (modo avanzado).',
    strengths: [],
    contextWindow: 'Según OpenRouter',
    pricing: 'Según OpenRouter',
    requiresApiKey: 'OPENROUTER_API_KEY',
    supportsWebSearch: isOnline,
  };
};

// Helper para obtener modelo por ID. Busca primero en los modelos directos,
// luego en los curados de OpenRouter, y si no, si parece un slug de OpenRouter
// (contiene '/') construye un modelo ad-hoc para el modo avanzado.
export const getModelById = (modelId: string): AIModelInfo | undefined => {
  const direct = AI_MODELS.find(m => m.id === modelId);
  if (direct) return direct;

  const curatedOpenRouter = OPENROUTER_MODELS.find(m => m.id === modelId);
  if (curatedOpenRouter) return curatedOpenRouter;

  // Modo avanzado: cualquier slug de OpenRouter tiene forma "vendor/model[...]"
  if (modelId.includes('/')) {
    return buildAdHocOpenRouterModel(modelId);
  }

  return undefined;
};

// Helper para obtener país por código
export const getCountryByCode = (code: string): CountryInfo | undefined => {
  return COUNTRIES.find(c => c.code === code);
};

// Modelos por defecto
export const DEFAULT_MODEL = 'gpt-4o-search-preview'; // Modelo con búsqueda web por defecto
export const DEFAULT_COUNTRY = 'ES';

// ==========================================
// CONFIGURACIÓN LEGACY (mantener compatibilidad)
// ==========================================

// Marcas objetivo de Occident/Catalana Occidente
export const TARGET_BRANDS = [
  "Occident",
  "Catalana Occidente", 
  "GCO",
  "Plus Ultra Seguros",
  "Seguros Bilbao",
  "NorteHispana"
] as const;

// Competidores principales
export const COMPETITOR_BRANDS = [
  "Mapfre",
  "Allianz", 
  "AXA",
  "Santaluc�a",
  "Caser",
  "Ocaso",
  "L�nea Directa",
  "Mutua Madrile�a",
  "Tuio",
  "Generali",
  "Pelayo",
  "MGS",
  "AMA"
] as const;

// Fuentes prioritarias (lista blanca)
export const PRIORITY_SOURCES = [
  "Rastreator",
  "Selectra", 
  "OCU",
  "Rankia",
  "Roams",
  "AvaiBook",
  "Lodgify",
  "Acierto",
  "Seguros.insure",
  "Trustpilot",
  "Finect"
] as const;

// Las 10 preguntas predefinidas organizadas por categor�as
export const ANALYSIS_QUESTIONS = {
  "hogar": [
    {
      id: "hogar_1",
      question: "�Cu�les son las mejores aseguradoras de hogar en Espa�a seg�n las comparativas m�s recientes?",
      category: "Hogar"
    },
    {
      id: "hogar_2", 
      question: "�Qu� opinan los usuarios sobre las coberturas de seguro de hogar de las principales aseguradoras espa�olas?",
      category: "Hogar"
    },
    {
      id: "hogar_3",
      question: "�Cu�les son las aseguradoras de hogar con mejor relaci�n calidad-precio seg�n los comparadores especializados?",
      category: "Hogar"
    }
  ],
  "alquiler_vacacional": [
    {
      id: "vacacional_1",
      question: "�Qu� aseguradoras ofrecen las mejores coberturas para alquiler vacacional en Espa�a?",
      category: "Alquiler Vacacional"
    },
    {
      id: "vacacional_2",
      question: "�Cu�les son las opiniones de propietarios sobre seguros para alquiler tur�stico y Airbnb?",
      category: "Alquiler Vacacional"
    },
    {
      id: "vacacional_3",
      question: "�Qu� coberturas espec�ficas recomiendan los expertos para propiedades de alquiler vacacional?",
      category: "Alquiler Vacacional"
    }
  ],
  "marca_confianza": [
    {
      id: "marca_1",
      question: "�Cu�les son las aseguradoras m�s confiables y con mejor reputaci�n en Espa�a seg�n estudios recientes?",
      category: "Marca y Confianza"
    },
    {
      id: "marca_2",
      question: "�Qu� aseguradoras tienen mejor valoraci�n en atenci�n al cliente y gesti�n de siniestros?",
      category: "Marca y Confianza"
    },
    {
      id: "marca_3",
      question: "�Cu�les son las aseguradoras mejor valoradas en transparencia y facilidad de contrataci�n?",
      category: "Marca y Confianza"
    },
    {
      id: "marca_4",
      question: "�Qu� opinan los usuarios sobre la solvencia y estabilidad financiera de las principales aseguradoras espa�olas?",
      category: "Marca y Confianza"
    }
  ]
} as const;

// Configuraci�n de an�lisis
export const ANALYSIS_CONFIG = {
  DEFAULT_MAX_SOURCES: 6,
  CONFIDENCE_THRESHOLDS: {
    HIGH: 0.8,
    MEDIUM: 0.5,
    LOW: 0.3
  },
  TIMEZONE: "Europe/Madrid",
  LOCALE: "es-ES"
} as const;

// Tipos de sentimiento
export const SENTIMENT_TYPES = ["positive", "negative", "neutral"] as const;

export type TargetBrand = typeof TARGET_BRANDS[number];
export type CompetitorBrand = typeof COMPETITOR_BRANDS[number];
export type PrioritySource = typeof PRIORITY_SOURCES[number];
export type SentimentType = typeof SENTIMENT_TYPES[number];
export type QuestionCategory = keyof typeof ANALYSIS_QUESTIONS;

// ==========================================
// CONFIGURACIÓN DE AUTENTICACIÓN
// ==========================================

/**
 * Whitelist de dominios permitidos para registro (valores iniciales)
 * Se gestionan desde el panel de admin, estos son solo defaults
 */
export const ALLOWED_EMAIL_DOMAINS: string[] = [];

/**
 * Whitelist de emails específicos permitidos (valores iniciales)
 * Se gestionan desde el panel de admin, estos son solo defaults
 */
export const ALLOWED_EMAILS: string[] = [
  'david@seobide.com', // Admin inicial
];

/**
 * Si es true, solo los emails/dominios en whitelist pueden registrarse
 * Si es false, cualquier email puede registrarse
 */
export const RESTRICT_REGISTRATION = true;

/**
 * Credenciales del panel de administración
 * URL: /admin
 */
export const ADMIN_CREDENTIALS = {
  email: 'david@seobide.com',
  password: 'Gonz2293*'
};