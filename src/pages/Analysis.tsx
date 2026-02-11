import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Settings, Eye, Edit3, Copy, Trash2, ChevronDown, ChevronRight, AlertCircle, CheckCircle, Loader2, Info, Globe, Cpu, Sparkles, Zap, DollarSign, Key } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import NotificationSystem from '../components/NotificationSystem';
import { useNotifications } from '../hooks/useNotifications';
import AnalysisResultsViewer from '../components/analysis/AnalysisResultsViewer';
import { useProjectStore } from '../store/projectStore';

interface AnalysisQuestion {
  id: string;
  question: string;
  category: string;
}

// Tipos para modelos de IA
interface AIModelInfo {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google';
  description: string;
  strengths: string[];
  contextWindow: string;
  pricing: string;
  recommended?: boolean;
  requiresApiKey: string;
}

// Tipos para países
interface CountryInfo {
  code: string;
  name: string;
  flag: string;
  language: string;
  locale: string;
  timezone: string;
  description: string;
  marketContext: string;
}

interface AnalysisTemplate {
  id: string;
  name: string;
  description: string;
  industry: string;
  targetBrands: string[];
  competitorBrands: string[];
  prioritySources: string[];
  questions: AnalysisQuestion[];
  aiModels?: string[];
}

interface CustomConfiguration {
  id: string;
  name: string;
  templateId?: string;
  targetBrand: string;
  competitorBrands: string[];
  prioritySources: string[];
  questions: AnalysisQuestion[];
  aiModels?: string[];
}

interface AnalysisSource {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  isPriority: boolean;
}

interface BrandMention {
  brand: string;
  mentioned: boolean;
  frequency: number;
  context: string;
  evidence: string[];
}

interface QuestionAnalysis {
  questionId: string;
  question: string;
  category: string;
  summary: string;
  sources: AnalysisSource[];
  brandMentions: BrandMention[];
  sentiment: string;
  confidenceScore: number;
}

interface AnalysisResult {
  analysisId: string;
  timestamp: string;
  categories: string[];
  questions: QuestionAnalysis[];
  overallConfidence: number;
  totalSources: number;
  prioritySources: number;
  brandSummary: {
    targetBrands: BrandMention[];
    competitors: BrandMention[];
  };
  brandSummaryByType?: {
    all: {
      targetBrands: BrandMention[];
      competitors: BrandMention[];
    };
    generic: {
      targetBrands: BrandMention[];
      competitors: BrandMention[];
    };
    specific: {
      targetBrands: BrandMention[];
      competitors: BrandMention[];
    };
  };
}

const Analysis = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<AnalysisTemplate[]>([]);
  const [customConfigurations, setCustomConfigurations] = useState<CustomConfiguration[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<AnalysisTemplate | CustomConfiguration | null>(null);
  const [configType, setConfigType] = useState<'template' | 'custom'>('template');
  const [showQuestions, setShowQuestions] = useState(false);
  const [editableQuestions, setEditableQuestions] = useState<AnalysisQuestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<{ code: string; message: string } | null>(null);

  // Nuevos estados para modelo y país
  const [aiModels, setAiModels] = useState<AIModelInfo[]>([]);
  const [countries, setCountries] = useState<CountryInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o-mini');
  const [selectedCountry, setSelectedCountry] = useState<string>('ES');
  const [showModelInfo, setShowModelInfo] = useState(false);
  const [showCountryInfo, setShowCountryInfo] = useState(false);

  // Proyecto seleccionado
  const { selectedProjectId } = useProjectStore();

  // Sistema de notificaciones
  const { notifications, removeNotification, notifySuccess, notifyError, notifyInfo } = useNotifications();

  // Función para crear configuración de prueba
  const createTestConfiguration = () => {
    const testConfig: CustomConfiguration = {
      id: 'test-config-' + Date.now(),
      name: 'Configuración de Prueba',
      targetBrand: 'Coca-Cola',
      competitorBrands: ['Pepsi', 'Sprite', 'Fanta'],
      prioritySources: ['Google News', 'Twitter', 'Reddit'],
      aiModels: ['chatgpt', 'claude', 'gemini'],
      questions: [
        {
          id: 'q1',
          question: '¿Cuál es la percepción general de la marca objetivo?',
          category: 'Percepción'
        },
        {
          id: 'q2',
          question: '¿Cómo se compara con sus competidores principales?',
          category: 'Competencia'
        }
      ]
    };
    
    console.log('Configuración de prueba creada:', testConfig);
    setSelectedConfig(testConfig);
    setConfigType('custom');
    setEditableQuestions([...testConfig.questions]);
    setShowQuestions(true);
    
    // Notificación de configuración creada
    notifyInfo(
      'Configuración de Prueba Creada',
      'Se ha creado una configuración de prueba con 2 preguntas para Coca-Cola vs competidores.'
    );
  };

  // Cargar plantillas, configuraciones, modelos y países al montar el componente
  useEffect(() => {
    loadTemplates();
    loadCustomConfigurations();
    loadAIModels();
    loadCountries();
  }, []);

  const loadAIModels = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.aiModels);
      const data = await response.json();
      if (data.success) {
        setAiModels(data.data.models);
        if (data.data.defaultModel) {
          setSelectedModel(data.data.defaultModel);
        }
      }
    } catch (error) {
      console.error('Error cargando modelos de IA:', error);
    }
  };

  const loadCountries = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.countries);
      const data = await response.json();
      if (data.success) {
        setCountries(data.data.countries);
        if (data.data.defaultCountry) {
          setSelectedCountry(data.data.defaultCountry);
        }
      }
    } catch (error) {
      console.error('Error cargando países:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.predefinedTemplates);
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data);
      }
    } catch (error) {
      console.error('Error cargando plantillas:', error);
      setError('Error cargando plantillas predefinidas');
    }
  };

  const loadCustomConfigurations = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.customConfigurations}/all`);
      const data = await response.json();
      if (data.success) {
        setCustomConfigurations(data.data);
      }
    } catch (error) {
      console.error('Error cargando configuraciones:', error);
      setError('Error cargando configuraciones personalizadas');
    }
  };

  const handleConfigSelection = (config: AnalysisTemplate | CustomConfiguration, type: 'template' | 'custom') => {
    setSelectedConfig(config);
    setConfigType(type);
    setEditableQuestions([...config.questions]);
    setShowQuestions(false);
    setError(null);
  };

  const handleQuestionEdit = (questionId: string, newText: string) => {
    setEditableQuestions(prev => 
      prev.map(q => q.id === questionId ? { ...q, question: newText } : q)
    );
  };

  const executeAnalysis = async () => {
    if (!selectedConfig || editableQuestions.length === 0) {
      setError('Selecciona una configuración y asegúrate de tener preguntas');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      // Preparar las categorías únicas de las preguntas
      const categories = [...new Set(editableQuestions.map(q => q.category))];
      
      // Validación básica de categorías en el frontend
      if (categories.length === 0) {
        setError('No se encontraron categorías válidas en las preguntas');
        setIsAnalyzing(false);
        return;
      }
      
      console.log('Enviando análisis con configuración:', {
        categories,
        configuration: {
          ...selectedConfig,
          questions: editableQuestions
        }
      });
      
      // Obtener API keys del usuario desde localStorage
      const userApiKeys = localStorage.getItem('userApiKeys');
      let parsedApiKeys = null;
      if (userApiKeys) {
        try {
          parsedApiKeys = JSON.parse(userApiKeys);
        } catch (e) {
          console.error('Error parsing user API keys:', e);
        }
      }

      // Obtener información del país seleccionado para el contexto
      const countryInfo = countries.find(c => c.code === selectedCountry);

      const response = await fetch(API_ENDPOINTS.analysisExecute, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          categories,
          configuration: {
            ...selectedConfig,
            questions: editableQuestions
          },
          userApiKeys: parsedApiKeys,
          projectId: selectedProjectId || undefined,
          // Parámetros: modelo y país (del dropdown)
          selectedModel: selectedModel,
          countryCode: selectedCountry,
          countryName: countryInfo?.name || 'España',
          timezone: countryInfo?.timezone || 'Europe/Madrid'
        }),
      });

      console.log('Respuesta del servidor:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor:', errorText);

        // Intentar parsear el error como JSON para obtener más detalles
        try {
          const errorData = JSON.parse(errorText);

          // Detectar errores de API keys específicos
          if (errorData.code === 'API_KEYS_REQUIRED' ||
              errorData.code === 'OPENAI_KEY_REQUIRED' ||
              errorData.code === 'ANTHROPIC_KEY_REQUIRED' ||
              errorData.code === 'GOOGLE_KEY_REQUIRED') {
            setApiKeyError({ code: errorData.code, message: errorData.message });
            notifyError(
              errorData.error || 'API Keys Requeridas',
              errorData.message,
              { duration: 10000 }
            );
            setIsAnalyzing(false);
            return;
          }

          if (errorData.error && errorData.invalidCategories) {
            throw new Error(`Error de validación: ${errorData.error}. Categorías inválidas: ${errorData.invalidCategories.join(', ')}`);
          }
        } catch (parseError) {
          // Si no se puede parsear, usar el error original
        }

        throw new Error(`Error ${response.status}: ${errorText}`);
      }

      // Limpiar error de API keys si la petición fue exitosa
      setApiKeyError(null);

      const data = await response.json();
      console.log('Datos recibidos:', data);
      console.log('Estructura de data.data:', data.data);
      console.log('¿Tiene analysisId?', data.data?.analysisId);
      console.log('¿Tiene results?', data.data?.results);

      if (data.success) {
        console.log('Guardando analysisResult:', data.data);
        setAnalysisResult(data.data);
        
        // Notificación de éxito
        notifySuccess(
          'Análisis Completado',
          `Se analizaron ${editableQuestions.length} preguntas exitosamente. ID: ${data.data.analysisId}`,
          { duration: 8000 }
        );
        
        setError(null);
      } else {
        const errorMsg = data.error || 'Error ejecutando el análisis';
        setError(errorMsg);
        notifyError('Error en Análisis', errorMsg);
      }
    } catch (error) {
      console.error('Error en análisis:', error);
      const errorMsg = `Error de conexión durante el análisis: ${error.message}`;
      setError(errorMsg);
      notifyError('Error de Conexión', errorMsg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateReport = async (format: 'markdown' | 'json') => {
    if (!analysisResult) return;

    try {
      // Preparar la configuración para enviar
      const configuration = selectedConfig ? {
        targetBrand: 'targetBrand' in selectedConfig ? selectedConfig.targetBrand : undefined,
        targetBrands: 'targetBrands' in selectedConfig ? selectedConfig.targetBrands : undefined,
        industry: 'industry' in selectedConfig ? selectedConfig.industry : undefined
      } : undefined;

      const response = await fetch(`${API_ENDPOINTS.analysisReport}/${format}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysisResult,
          configuration
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Crear y descargar el archivo
        const mimeType = format === 'markdown' ? 'text/markdown' : 'application/json';
        const blob = new Blob([format === 'json' ? JSON.stringify(data.data.content, null, 2) : data.data.content], {
          type: mimeType
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Notificación de descarga exitosa
        notifySuccess(
          'Informe Descargado',
          `El informe en formato ${format.toUpperCase()} se ha descargado exitosamente.`
        );
      }
    } catch (error) {
      console.error('Error generando informe:', error);
      const errorMsg = 'Error generando el informe';
      setError(errorMsg);
      notifyError('Error de Descarga', errorMsg);
    }
  };

  const generateTableReport = async () => {
    if (!analysisResult) return;

    try {
      // Preparar la configuración para enviar
      const configuration = selectedConfig ? {
        targetBrand: 'targetBrand' in selectedConfig ? selectedConfig.targetBrand : undefined,
        targetBrands: 'targetBrands' in selectedConfig ? selectedConfig.targetBrands : undefined,
        industry: 'industry' in selectedConfig ? selectedConfig.industry : undefined
      } : undefined;

      const response = await fetch(`${API_ENDPOINTS.analysisReportTable}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysisResult,
          configuration
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Crear y descargar el archivo
        const blob = new Blob([data.data.content], {
          type: 'text/csv'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Notificación de descarga exitosa
        notifySuccess(
          'Informe Descargado',
          'El informe en formato TABLA (CSV) se ha descargado exitosamente.'
        );
      }
    } catch (error) {
      console.error('Error generando informe en tabla:', error);
      const errorMsg = 'Error generando el informe en tabla';
      setError(errorMsg);
      notifyError('Error de Descarga', errorMsg);
    }
  };

  const groupQuestionsByCategory = (questions: AnalysisQuestion[]) => {
    return questions.reduce((acc, question) => {
      if (!acc[question.category]) {
        acc[question.category] = [];
      }
      acc[question.category].push(question);
      return acc;
    }, {} as Record<string, AnalysisQuestion[]>);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Análisis de Marca</h1>
        <p className="text-gray-600">
          Selecciona una configuración predefinida o personalizada para ejecutar tu análisis
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* API Keys Error Alert - Prominente */}
      {apiKeyError && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-6 shadow-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <Key className="h-8 w-8 text-amber-500" />
            </div>
            <div className="ml-4 flex-1">
              <h3 className="text-lg font-semibold text-amber-800">
                {apiKeyError.code === 'API_KEYS_REQUIRED' ? 'API Keys No Configuradas' :
                 apiKeyError.code === 'OPENAI_KEY_REQUIRED' ? 'API Key de OpenAI Requerida' :
                 apiKeyError.code === 'ANTHROPIC_KEY_REQUIRED' ? 'API Key de Anthropic Requerida' :
                 apiKeyError.code === 'GOOGLE_KEY_REQUIRED' ? 'API Key de Google AI Requerida' :
                 'Configuración de API Keys'}
              </h3>
              <p className="mt-1 text-amber-700">{apiKeyError.message}</p>
              <div className="mt-4 flex space-x-3">
                <button
                  onClick={() => navigate('/configuration')}
                  className="inline-flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
                >
                  <Key className="h-4 w-4 mr-2" />
                  Ir a Configuración de API Keys
                </button>
                <button
                  onClick={() => setApiKeyError(null)}
                  className="inline-flex items-center px-4 py-2 bg-white text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plantillas Predefinidas */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Plantillas Predefinidas</h2>
          <div className="space-y-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                  selectedConfig?.id === template.id && configType === 'template'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => handleConfigSelection(template, 'template')}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{template.name}</h3>
                    <p className="text-sm text-gray-600">{template.description}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {template.questions.length} preguntas • {template.industry}
                    </p>
                  </div>
                  {selectedConfig?.id === template.id && configType === 'template' && (
                    <CheckCircle className="h-5 w-5 text-blue-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Configuraciones Personalizadas */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Configuraciones Personalizadas</h2>
            <button
              onClick={createTestConfiguration}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
            >
              Crear Prueba
            </button>
          </div>
          {customConfigurations.length === 0 ? (
            <div className="text-center py-8">
              <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No hay configuraciones personalizadas</p>
              <p className="text-sm text-gray-400 mt-1">
                Ve a Configuración para crear una nueva o usa "Crear Prueba"
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {customConfigurations.map((config) => (
                <div
                  key={config.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedConfig?.id === config.id && configType === 'custom'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleConfigSelection(config, 'custom')}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{config.name}</h3>
                      <p className="text-sm text-gray-600">Marca: {config.targetBrand}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {config.questions.length} preguntas • {config.competitorBrands.length} competidores
                      </p>
                    </div>
                    {selectedConfig?.id === config.id && configType === 'custom' && (
                      <CheckCircle className="h-5 w-5 text-blue-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Model & Country Selection Panel */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Settings className="h-5 w-5 mr-2 text-blue-600" />
            Configuración del Análisis
          </h2>
          <div className="flex items-center text-sm text-gray-500">
            <Info className="h-4 w-4 mr-1" />
            Selecciona el modelo de IA y el país para contextualizar las preguntas
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Model Selector */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900 flex items-center">
                <Cpu className="h-4 w-4 mr-2 text-purple-600" />
                Modelo de IA
              </h3>
              <button
                onClick={() => setShowModelInfo(!showModelInfo)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
              >
                <Info className="h-4 w-4 mr-1" />
                {showModelInfo ? 'Ocultar info' : 'Ver detalles'}
              </button>
            </div>

            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <optgroup label="OpenAI (GPT)">
                {aiModels.filter(m => m.provider === 'openai').map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} {model.recommended ? '⭐' : ''} - {model.pricing}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Anthropic (Claude)">
                {aiModels.filter(m => m.provider === 'anthropic').map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} {model.recommended ? '⭐' : ''} - {model.pricing}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Google (Gemini)">
                {aiModels.filter(m => m.provider === 'google').map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} {model.recommended ? '⭐' : ''} - {model.pricing}
                  </option>
                ))}
              </optgroup>
            </select>

            {/* Model Info Panel */}
            {showModelInfo && (() => {
              const model = aiModels.find(m => m.id === selectedModel);
              if (!model) return null;
              return (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-gray-900 flex items-center">
                      {model.name}
                      {model.recommended && (
                        <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full flex items-center">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Recomendado
                        </span>
                      )}
                    </h4>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      model.provider === 'openai' ? 'bg-green-100 text-green-800' :
                      model.provider === 'anthropic' ? 'bg-orange-100 text-orange-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {model.provider === 'openai' ? 'OpenAI' :
                       model.provider === 'anthropic' ? 'Anthropic' : 'Google'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{model.description}</p>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="flex items-center text-sm">
                      <Zap className="h-4 w-4 mr-2 text-yellow-500" />
                      <span className="text-gray-600">Contexto: {model.contextWindow}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <DollarSign className="h-4 w-4 mr-2 text-green-500" />
                      <span className="text-gray-600">{model.pricing}</span>
                    </div>
                  </div>

                  <div className="mb-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Fortalezas:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {model.strengths.map((strength, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                          {strength}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                    <strong>Requiere:</strong> API Key de {model.requiresApiKey.replace('_API_KEY', '')} configurada
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Country Selector */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900 flex items-center">
                <Globe className="h-4 w-4 mr-2 text-green-600" />
                País / Mercado
              </h3>
              <button
                onClick={() => setShowCountryInfo(!showCountryInfo)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
              >
                <Info className="h-4 w-4 mr-1" />
                {showCountryInfo ? 'Ocultar info' : 'Ver detalles'}
              </button>
            </div>

            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <optgroup label="Europa">
                {countries.filter(c => ['ES', 'PT', 'GB', 'DE', 'FR', 'IT'].includes(c.code)).map(country => (
                  <option key={country.code} value={country.code}>
                    {country.flag} {country.name} ({country.language})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Latinoamérica">
                {countries.filter(c => ['MX', 'AR', 'CO', 'CL', 'PE', 'EC', 'BR', 'LATAM'].includes(c.code)).map(country => (
                  <option key={country.code} value={country.code}>
                    {country.flag} {country.name} ({country.language})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Norteamérica">
                {countries.filter(c => ['US', 'US-ES'].includes(c.code)).map(country => (
                  <option key={country.code} value={country.code}>
                    {country.flag} {country.name} ({country.language})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Global">
                {countries.filter(c => c.code === 'GLOBAL').map(country => (
                  <option key={country.code} value={country.code}>
                    {country.flag} {country.name}
                  </option>
                ))}
              </optgroup>
            </select>

            {/* Country Info Panel */}
            {showCountryInfo && (() => {
              const country = countries.find(c => c.code === selectedCountry);
              if (!country) return null;
              const now = new Date();
              const formattedDate = now.toLocaleString(country.locale, {
                timeZone: country.timezone,
                dateStyle: 'full',
                timeStyle: 'short'
              });
              return (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center mb-2">
                    <span className="text-2xl mr-2">{country.flag}</span>
                    <h4 className="font-semibold text-gray-900">{country.name}</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{country.description}</p>

                  <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                    <span className="text-xs font-medium text-blue-800 uppercase block mb-1">
                      Prompt de sistema:
                    </span>
                    <p className="text-sm text-blue-900 font-mono bg-blue-100 p-2 rounded mt-1">
                      "País: {country.name}. Fecha y hora actual: {formattedDate}."
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Quick Selection Summary */}
        <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <Cpu className="h-4 w-4 mr-2 text-purple-600" />
                <span className="text-sm font-medium text-gray-700">
                  {aiModels.find(m => m.id === selectedModel)?.name || selectedModel}
                </span>
              </div>
              <span className="text-gray-300">|</span>
              <div className="flex items-center">
                <span className="text-lg mr-2">{countries.find(c => c.code === selectedCountry)?.flag}</span>
                <span className="text-sm font-medium text-gray-700">
                  {countries.find(c => c.code === selectedCountry)?.name || selectedCountry}
                </span>
              </div>
            </div>
            <span className="text-xs text-gray-500">
              Las preguntas se realizarán con el contexto del país seleccionado
            </span>
          </div>
        </div>
      </div>

      {/* Configuration Details */}
      {selectedConfig && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Configuración Seleccionada: {selectedConfig.name}
            </h2>
            <div className="flex space-x-2">
              <button
                onClick={() => setShowQuestions(!showQuestions)}
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                <Eye className="h-4 w-4 mr-2" />
                {showQuestions ? 'Ocultar' : 'Ver'} Preguntas
                {showQuestions ? <ChevronDown className="h-4 w-4 ml-1" /> : <ChevronRight className="h-4 w-4 ml-1" />}
              </button>
            </div>
          </div>

          {/* Configuration Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">Marca Objetivo</h3>
              <p className="text-sm text-gray-600">
                {'targetBrand' in selectedConfig ? selectedConfig.targetBrand : selectedConfig.targetBrands.join(', ')}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">Competidores</h3>
              <p className="text-sm text-gray-600">
                {selectedConfig.competitorBrands.slice(0, 3).join(', ')}
                {selectedConfig.competitorBrands.length > 3 && ` +${selectedConfig.competitorBrands.length - 3} más`}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">Modelos de IA</h3>
              <p className="text-sm text-gray-600">
                {selectedConfig.aiModels?.length ? 
                  selectedConfig.aiModels.slice(0, 2).map(model => 
                    model === 'chatgpt' ? 'ChatGPT' : 
                    model === 'claude' ? 'Claude' : 
                    model === 'gemini' ? 'Gemini' : 
                    model === 'perplexity' ? 'Perplexity' : model
                  ).join(', ') + (selectedConfig.aiModels.length > 2 ? ` +${selectedConfig.aiModels.length - 2} más` : '') :
                  'ChatGPT, Claude, Gemini'
                }
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">Fuentes</h3>
              <p className="text-sm text-gray-600">
                {selectedConfig.prioritySources?.length > 0
                  ? <>
                      {selectedConfig.prioritySources.slice(0, 2).join(', ')}
                      {selectedConfig.prioritySources.length > 2 && ` +${selectedConfig.prioritySources.length - 2} más`}
                    </>
                  : 'IA Generativa'
                }
              </p>
            </div>
          </div>

          {/* Questions Preview/Edit */}
          {showQuestions && (
            <div className="border-t pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">Preguntas del Análisis</h3>
                <span className="text-sm text-gray-500">
                  {editableQuestions.length} preguntas
                </span>
              </div>
              
              {Object.entries(groupQuestionsByCategory(editableQuestions)).map(([category, questions]) => (
                <div key={category} className="mb-6">
                  <h4 className="font-medium text-gray-800 mb-3 flex items-center">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs mr-2">
                      {questions.length}
                    </span>
                    {category}
                  </h4>
                  <div className="space-y-3">
                    {questions.map((question, index) => (
                      <div key={question.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-start">
                          <span className="bg-white text-gray-600 px-2 py-1 rounded text-xs font-medium mr-3 mt-1">
                            {index + 1}
                          </span>
                          <textarea
                            value={question.question}
                            onChange={(e) => handleQuestionEdit(question.id, e.target.value)}
                            className="flex-1 bg-transparent border-none resize-none focus:outline-none text-gray-700"
                            rows={2}
                          />
                          <Edit3 className="h-4 w-4 text-gray-400 ml-2 mt-2" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Analysis Controls */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-end">
              <button
                onClick={executeAnalysis}
                disabled={isAnalyzing || !selectedConfig}
                className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    <div className="flex flex-col items-start">
                      <span>Analizando...</span>
                      <span className="text-xs text-blue-200">
                        Procesando {editableQuestions.length} preguntas
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 mr-2" />
                    Ejecutar Análisis
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysisResult && (
        <AnalysisResultsViewer
          analysisResult={analysisResult}
          onDownload={generateReport}
          onDownloadTable={generateTableReport}
          configurationName={selectedConfig?.name}
        />
      )}
      
      {/* Sistema de Notificaciones */}
      <NotificationSystem 
        notifications={notifications} 
        onRemove={removeNotification} 
      />
    </div>
  );
};

export default Analysis;