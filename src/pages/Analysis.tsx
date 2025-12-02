import React, { useState, useEffect } from 'react';
import { Play, Settings, Eye, Edit3, Copy, Trash2, ChevronDown, ChevronRight, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
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
  const [templates, setTemplates] = useState<AnalysisTemplate[]>([]);
  const [customConfigurations, setCustomConfigurations] = useState<CustomConfiguration[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<AnalysisTemplate | CustomConfiguration | null>(null);
  const [configType, setConfigType] = useState<'template' | 'custom'>('template');
  const [showQuestions, setShowQuestions] = useState(false);
  const [editableQuestions, setEditableQuestions] = useState<AnalysisQuestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
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

  // Cargar plantillas y configuraciones al montar el componente
  useEffect(() => {
    loadTemplates();
    loadCustomConfigurations();
  }, []);

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
          projectId: selectedProjectId || undefined
        }),
      });

      console.log('Respuesta del servidor:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error del servidor:', errorText);
        
        // Intentar parsear el error como JSON para obtener más detalles
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error && errorData.invalidCategories) {
            throw new Error(`Error de validación: ${errorData.error}. Categorías inválidas: ${errorData.invalidCategories.join(', ')}`);
          }
        } catch (parseError) {
          // Si no se puede parsear, usar el error original
        }
        
        throw new Error(`Error ${response.status}: ${errorText}`);
      }

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
                {selectedConfig.prioritySources.slice(0, 2).join(', ')}
                {selectedConfig.prioritySources.length > 2 && ` +${selectedConfig.prioritySources.length - 2} más`}
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