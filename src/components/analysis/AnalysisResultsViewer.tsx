import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  Share2, 
  ChevronDown, 
  ChevronRight, 
  ExternalLink,
  TrendingUp,
  Target,
  Users,
  AlertCircle,
  CheckCircle,
  Info,
  BookOpen
} from 'lucide-react';

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
  // Nuevos campos para análisis mejorado
  detailedSentiment?: 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';
  contextualAnalysis?: {
    sentiment: 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';
    confidence: number;
    reasoning: string;
    competitivePosition: 'better' | 'worse' | 'equal' | 'not_compared';
    competitiveReasoning: string;
  };
}

interface MultiModelAnalysis {
  modelPersona: 'chatgpt' | 'claude' | 'gemini' | 'perplexity';
  generatedContent: string;
  brandMentions: BrandMention[];
  overallSentiment: 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';
  contextualInsights: string;
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
  // Nuevos campos para análisis multi-modelo
  multiModelAnalysis?: MultiModelAnalysis[];
  detailedSentiment?: 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';
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

interface AnalysisResultsViewerProps {
  analysisResult: AnalysisResult | null | undefined;
  onDownload: (format: 'markdown' | 'json') => void;
  onDownloadTable?: () => void;
  configurationName?: string;
}

const AnalysisResultsViewer: React.FC<AnalysisResultsViewerProps> = ({
  analysisResult,
  onDownload,
  onDownloadTable,
  configurationName
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [brandViewMode, setBrandViewMode] = useState<'all' | 'generic' | 'specific'>('all');

  // Debug logging
  console.log('AnalysisResultsViewer - analysisResult recibido:', analysisResult);
  console.log('AnalysisResultsViewer - tipo de analysisResult:', typeof analysisResult);
  console.log('AnalysisResultsViewer - es null?', analysisResult === null);
  console.log('AnalysisResultsViewer - es undefined?', analysisResult === undefined);
  console.log('AnalysisResultsViewer - tiene analysisId?', analysisResult?.analysisId);
  console.log('AnalysisResultsViewer - tiene questions?', analysisResult?.questions);

  // Early return if analysisResult is null or undefined
  if (!analysisResult) {
    console.log('AnalysisResultsViewer - Mostrando mensaje de no resultados porque analysisResult es falsy');
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay resultados disponibles</h3>
            <p className="text-gray-500">Los datos del análisis no están disponibles o no se han cargado correctamente.</p>
          </div>
        </div>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const tabs = [
    { id: 'overview', label: 'Resumen Ejecutivo', icon: TrendingUp },
    { id: 'questions', label: 'Análisis por Pregunta', icon: FileText },
    { id: 'brands', label: 'Menciones de Marca', icon: Target },
    { id: 'sources', label: 'Respuestas IA Analizadas', icon: ExternalLink },
    { id: 'models', label: 'Comparación de Modelos', icon: Users }
  ];

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'Alta';
    if (confidence >= 0.6) return 'Media';
    return 'Baja';
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case 'very_positive':
        return 'bg-green-100 text-green-800';
      case 'positive':
        return 'bg-green-50 text-green-700';
      case 'neutral':
        return 'bg-gray-100 text-gray-700';
      case 'negative':
        return 'bg-red-50 text-red-700';
      case 'very_negative':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getSentimentLabel = (sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case 'very_positive':
        return 'Muy Positivo';
      case 'positive':
        return 'Positivo';
      case 'neutral':
        return 'Neutral';
      case 'negative':
        return 'Negativo';
      case 'very_negative':
        return 'Muy Negativo';
      default:
        return 'No definido';
    }
  };

  const getModelPersonaIcon = (persona: string) => {
    switch (persona) {
      case 'chatgpt':
        return '🤖';
      case 'claude':
        return '🧠';
      case 'gemini':
        return '💎';
      case 'perplexity':
        return '🔍';
      default:
        return '🤖';
    }
  };

  const getModelPersonaName = (persona: string) => {
    switch (persona) {
      case 'chatgpt':
        return 'ChatGPT';
      case 'claude':
        return 'Claude';
      case 'gemini':
        return 'Gemini';
      case 'perplexity':
        return 'Perplexity';
      default:
        return persona;
    }
  };

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Resultados del Análisis</h2>
            <p className="text-blue-100 text-sm mt-1">
              ID: {analysisResult?.analysisId || 'N/A'} • {analysisResult?.timestamp ? new Date(analysisResult.timestamp).toLocaleString() : 'N/A'}
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => onDownload('markdown')}
              className="flex items-center px-3 py-2 bg-white/10 text-white rounded-md hover:bg-white/20 transition-colors text-sm"
            >
              <Download className="h-4 w-4 mr-2" />
              Markdown
            </button>
            <button
              onClick={() => onDownload('json')}
              className="flex items-center px-3 py-2 bg-white/10 text-white rounded-md hover:bg-white/20 transition-colors text-sm"
            >
              <Download className="h-4 w-4 mr-2" />
              JSON
            </button>
            {onDownloadTable && (
              <button
                onClick={onDownloadTable}
                className="flex items-center px-3 py-2 bg-white/10 text-white rounded-md hover:bg-white/20 transition-colors text-sm"
              >
                <Download className="h-4 w-4 mr-2" />
                Tabla (CSV)
              </button>
            )}
            <button className="flex items-center px-3 py-2 bg-white/10 text-white rounded-md hover:bg-white/20 transition-colors text-sm">
              <Share2 className="h-4 w-4 mr-2" />
              Compartir
            </button>
          </div>
        </div>
      </div>

      {/* Success Banner */}
      <div className="bg-green-50 border-b border-green-200 px-6 py-3">
        <div className="flex items-center">
          <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
          <span className="text-green-700 font-medium">
            Análisis completado exitosamente
          </span>
          {configurationName && (
            <span className="text-green-600 ml-2">• Configuración: {configurationName}</span>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4 mr-2" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Métricas principales */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center">
                  <FileText className="h-8 w-8 text-blue-600 mr-3" />
                  <div>
                    <h3 className="font-medium text-blue-900">Preguntas Analizadas</h3>
                    <p className="text-2xl font-bold text-blue-700">
                      {analysisResult?.questions?.length || 0}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center">
                  <ExternalLink className="h-8 w-8 text-green-600 mr-3" />
                  <div>
                    <h3 className="font-medium text-green-900">Respuestas IA</h3>
                    <p className="text-2xl font-bold text-green-700">
                      {analysisResult?.totalSources || 0}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="flex items-center">
                  <Target className="h-8 w-8 text-purple-600 mr-3" />
                  <div>
                    <h3 className="font-medium text-purple-900">Menciones Detectadas</h3>
                    <p className="text-2xl font-bold text-purple-700">
                      {analysisResult?.brandSummary?.targetBrands?.reduce((total, brand) => total + brand.frequency, 0) || 0}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-orange-50 rounded-lg p-4">
                <div className="flex items-center">
                  <TrendingUp className="h-8 w-8 text-orange-600 mr-3" />
                  <div>
                    <h3 className="font-medium text-orange-900">Confianza</h3>
                    <p className="text-2xl font-bold text-orange-700">
                      {Math.round((analysisResult?.overallConfidence || 0) * 100)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Resumen ejecutivo */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Info className="h-5 w-5 text-blue-600 mr-2" />
                Resumen del Análisis de IA Generativa
              </h3>
              <div className="prose prose-sm max-w-none">
                <p className="text-gray-700 mb-4">
                  Este análisis evalúa la presencia de tu marca en las respuestas generadas por inteligencia artificial. 
                  Se han analizado <strong>{analysisResult?.questions?.length || 0} preguntas</strong> relevantes para tu sector, 
                  obteniendo respuestas de modelos de IA y midiendo la frecuencia y contexto de las menciones de marca.
                </p>
                
                {analysisResult?.brandSummary?.targetBrands && analysisResult.brandSummary.targetBrands.length > 0 && (
                  <div className="bg-white rounded-lg p-4 border">
                    <h4 className="font-medium text-gray-900 mb-2">Hallazgos Principales:</h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-700">
                      {analysisResult.brandSummary.targetBrands.map((brand, idx) => (
                        <li key={idx}>
                          <strong>{brand.brand}</strong>: {brand.frequency} menciones detectadas 
                          {brand.context && ` con contexto ${getSentimentLabel(brand.context).toLowerCase()}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <p className="text-gray-600 text-sm mt-4">
                  <strong>Metodología:</strong> Cada pregunta fue enviada a un modelo de IA generativa actuando como experto en tu sector. 
                  Las respuestas obtenidas fueron posteriormente analizadas para identificar menciones de marca, 
                  frecuencia de aparición y contexto de las menciones.
                </p>
              </div>
            </div>

            {/* Resumen de categorías */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-3">Categorías Analizadas</h3>
              <div className="flex flex-wrap gap-2">
                {analysisResult?.categories?.map((category) => (
                  <span
                    key={category}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                  >
                    {category}
                  </span>
                )) || (
                  <span className="text-gray-500 text-sm">No hay categorías disponibles</span>
                )}
              </div>
            </div>

            {/* Indicador de calidad del análisis */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-900">Calidad del Análisis</h3>
                <span className={`font-medium ${getConfidenceColor(analysisResult?.overallConfidence || 0)}`}>
                  {getConfidenceLabel(analysisResult?.overallConfidence || 0)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full transition-all duration-300 ${
                    (analysisResult?.overallConfidence || 0) >= 0.8 ? 'bg-green-500' :
                    (analysisResult?.overallConfidence || 0) >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${(analysisResult?.overallConfidence || 0) * 100}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Confianza promedio: {Math.round((analysisResult?.overallConfidence || 0) * 100)}%
              </p>
            </div>
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                Análisis Detallado por Pregunta
              </h3>
              <span className="text-sm text-gray-500">
                {analysisResult?.questions?.length || 0} preguntas analizadas
              </span>
            </div>
            
            {analysisResult?.questions?.map((question, index) => (
              <div key={question.questionId} className="border rounded-lg">
                <button
                  onClick={() => toggleSection(`question-${question.questionId}`)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center">
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium mr-3">
                        {index + 1}
                      </span>
                      <h4 className="font-medium text-gray-900">{question.category}</h4>
                      <span className={`ml-3 px-2 py-1 rounded-full text-xs font-medium ${getSentimentColor(question.sentiment)}`}>
                        {getSentimentLabel(question.sentiment)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 ml-12">{question.question}</p>
                    <div className="flex items-center mt-2 ml-12">
                      <span className="text-xs text-gray-500 mr-4">
                        Confianza: {Math.round(question.confidenceScore * 100)}%
                      </span>
                      <span className="text-xs text-gray-500">
                        {question.sources.length} fuentes
                      </span>
                    </div>
                  </div>
                  {expandedSections.has(`question-${question.questionId}`) ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                </button>
                
                {expandedSections.has(`question-${question.questionId}`) && (
                  <div className="border-t p-4">
                    <div className="mb-4">
                      <h5 className="font-medium text-gray-900 mb-2">Respuesta de IA Analizada</h5>
                      <p className="text-gray-700 text-sm leading-relaxed">{question.summary}</p>
                    </div>

                    {/* Análisis Multi-Modelo */}
                    {question.multiModelAnalysis && question.multiModelAnalysis.length > 0 && (
                      <div className="mb-4">
                        <h5 className="font-medium text-gray-900 mb-3 flex items-center">
                          🤖 Análisis Multi-Modelo
                          <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                            {question.multiModelAnalysis.length} modelos
                          </span>
                        </h5>
                        <div className="grid gap-3">
                          {question.multiModelAnalysis.map((modelAnalysis, idx) => (
                            <div key={idx} className="bg-gray-50 rounded-lg p-3 border">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center">
                                  <span className="text-lg mr-2">{getModelPersonaIcon(modelAnalysis.modelPersona)}</span>
                                  <span className="font-medium text-gray-900">{getModelPersonaName(modelAnalysis.modelPersona)}</span>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSentimentColor(modelAnalysis.overallSentiment)}`}>
                                  {getSentimentLabel(modelAnalysis.overallSentiment)}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 mb-2">{modelAnalysis.contextualInsights}</p>
                              <div className="text-xs text-gray-600">
                                <strong>Menciones:</strong> {modelAnalysis.brandMentions.filter(m => m.mentioned).length} de {modelAnalysis.brandMentions.length} marcas
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Análisis Contextual Detallado */}
                    {question.contextualInsights && (
                      <div className="mb-4">
                        <h5 className="font-medium text-gray-900 mb-2">💡 Insights Contextuales</h5>
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                          <p className="text-sm text-blue-800">{question.contextualInsights}</p>
                        </div>
                      </div>
                    )}

                    {/* Análisis Competitivo */}
                    {question.competitiveAnalysis && (
                      <div className="mb-4">
                        <h5 className="font-medium text-gray-900 mb-2">⚔️ Análisis Competitivo</h5>
                        <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                          <p className="text-sm text-orange-800 mb-2">{question.competitiveAnalysis.targetBrandPosition}</p>
                          {question.competitiveAnalysis.competitorComparisons.length > 0 && (
                            <div className="space-y-1">
                              {question.competitiveAnalysis.competitorComparisons.map((comp, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs">
                                  <span className="font-medium">{comp.competitor}:</span>
                                  <span className={`px-2 py-1 rounded-full ${
                                    comp.advantage === 'target' ? 'bg-green-100 text-green-800' :
                                    comp.advantage === 'competitor' ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {comp.advantage === 'target' ? 'Ventaja nuestra' : 
                                     comp.advantage === 'competitor' ? 'Ventaja competidor' : 'Neutral'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Fuentes utilizadas por ChatGPT */}
                    {question.sources.length > 0 && (
                      <div className="mb-4">
                        <h5 className="font-medium text-gray-900 mb-2 flex items-center">
                          <BookOpen className="h-4 w-4 mr-2" />
                          Fuentes utilizadas por ChatGPT
                        </h5>
                        <div className="space-y-2">
                          {question.sources.map((source, sourceIndex) => (
                            <div key={sourceIndex} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center mb-1">
                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mr-2 ${
                                      source.isPriority ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600'
                                    }`}>
                                      {source.isPriority ? 'Fuente Prioritaria' : 'Fuente General'}
                                    </span>
                                    <span className="text-xs text-gray-500">{source.domain}</span>
                                  </div>
                                  <h6 className="font-medium text-blue-900 mb-1">{source.title}</h6>
                                  <p className="text-sm text-blue-800 leading-relaxed">{source.snippet}</p>
                                </div>
                                {source.url && source.url !== 'generative-ai-response' && source.url !== 'ai-generated' && source.url !== 'ai-generated-response' && (
                                  <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-3 text-blue-600 hover:text-blue-800"
                                    title="Ver fuente original"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Brand Mentions */}
                    {question.brandMentions.length > 0 && (
                      <div className="mb-4">
                        <h5 className="font-medium text-gray-900 mb-2">Menciones de Marca Detectadas</h5>
                        <div className="space-y-2">
                          {question.brandMentions.map((mention, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-white border rounded-lg">
                              <div className="flex-1">
                                <span className="font-medium text-gray-900">{mention.brand}</span>
                                <p className="text-sm text-gray-600 mt-1">{mention.context}</p>
                                
                                {/* Análisis Contextual Detallado de la Mención */}
                                {mention.contextualAnalysis && (
                                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-medium">Análisis Detallado:</span>
                                      <span className={`px-2 py-1 rounded-full ${getSentimentColor(mention.contextualAnalysis.sentiment)}`}>
                                        {getSentimentLabel(mention.contextualAnalysis.sentiment)}
                                      </span>
                                    </div>
                                    <p className="text-gray-700">{mention.contextualAnalysis.reasoning}</p>
                                    <div className="mt-1 text-gray-600">
                                      Confianza: {Math.round(mention.contextualAnalysis.confidence * 100)}%
                                    </div>
                                  </div>
                                )}
                                
                                {mention.evidence.length > 0 && (
                                  <div className="mt-2">
                                    <p className="text-xs font-medium text-gray-700 mb-1">Evidencia:</p>
                                    <ul className="text-xs text-gray-600 list-disc list-inside">
                                      {mention.evidence.slice(0, 2).map((evidence, evidenceIdx) => (
                                        <li key={evidenceIdx}>{evidence}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center space-x-2 ml-4">
                                <span className="text-sm font-medium text-gray-900">
                                  {mention.frequency} menciones
                                </span>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  mention.mentioned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {mention.mentioned ? 'Mencionada' : 'No mencionada'}
                                </span>
                                {mention.detailedSentiment && (
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSentimentColor(mention.detailedSentiment)}`}>
                                    {getSentimentLabel(mention.detailedSentiment)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {question.sources.length > 0 && (
                      <div className="mb-4">
                        <h5 className="font-medium text-gray-900 mb-2">Respuesta IA Original</h5>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <div className="flex items-start">
                            <div className="flex-1">
                              <p className="text-sm text-blue-900 font-medium mb-1">
                                Contenido generado por IA para: "{question.question}"
                              </p>
                              <p className="text-sm text-blue-800 leading-relaxed">
                                {question.sources[0]?.snippet || 'Contenido no disponible'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'brands' && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Resumen de Marcas</h3>

                {/* Toggle para cambiar vista de comparativas */}
                {analysisResult?.brandSummaryByType && (
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setBrandViewMode('all')}
                      className={`px-4 py-2 text-sm rounded-md transition-colors ${
                        brandViewMode === 'all'
                          ? 'bg-white text-gray-900 shadow'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Todas las preguntas
                    </button>
                    <button
                      onClick={() => setBrandViewMode('generic')}
                      className={`px-4 py-2 text-sm rounded-md transition-colors ${
                        brandViewMode === 'generic'
                          ? 'bg-white text-gray-900 shadow'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Solo genéricas
                    </button>
                    <button
                      onClick={() => setBrandViewMode('specific')}
                      className={`px-4 py-2 text-sm rounded-md transition-colors ${
                        brandViewMode === 'specific'
                          ? 'bg-white text-gray-900 shadow'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Solo específicas
                    </button>
                  </div>
                )}
              </div>

              {/* Descripción del modo seleccionado */}
              {analysisResult?.brandSummaryByType && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    {brandViewMode === 'all' &&
                      "Mostrando menciones en TODAS las preguntas (genéricas + específicas de marca)"}
                    {brandViewMode === 'generic' &&
                      "Mostrando solo menciones en preguntas que NO incluyen nombres de marca"}
                    {brandViewMode === 'specific' &&
                      "Mostrando solo menciones en preguntas que SÍ incluyen nombres de marca"}
                  </p>
                </div>
              )}

              {/* Obtener datos según el modo seleccionado */}
              {(() => {
                const brandData = analysisResult?.brandSummaryByType?.[brandViewMode] || analysisResult?.brandSummary;
                const targetBrands = brandData?.targetBrands || [];
                const competitors = brandData?.competitors || [];

                return (
                  <>
                    {/* Marcas objetivo */}
                    {targetBrands.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                    <Target className="h-5 w-5 text-blue-600 mr-2" />
                    Marcas Objetivo
                  </h4>
                  <div className="grid gap-3">
                    {targetBrands.map((brand, idx) => (
                      <div key={idx} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium text-gray-900">{brand.brand}</h5>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-600">
                              {brand.frequency} menciones
                            </span>
                            <span className={`px-2 py-1 rounded-full text-xs ${getSentimentColor(brand.context)}`}>
                              {getSentimentLabel(brand.context)}
                            </span>
                          </div>
                        </div>
                        {brand.evidence.length > 0 && (
                          <div className="text-sm text-gray-600">
                            <p className="font-medium mb-1">Evidencia:</p>
                            <ul className="list-disc list-inside space-y-1">
                              {brand.evidence.slice(0, 3).map((evidence, evidenceIdx) => (
                                <li key={evidenceIdx}>{evidence}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                    )}

                    {/* Competidores */}
                    {competitors.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                    <Users className="h-5 w-5 text-orange-600 mr-2" />
                    Competidores
                  </h4>
                  <div className="grid gap-3">
                    {competitors.map((brand, idx) => (
                      <div key={idx} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium text-gray-900">{brand.brand}</h5>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-600">
                              {brand.frequency} menciones
                            </span>
                            <span className={`px-2 py-1 rounded-full text-xs ${getSentimentColor(brand.context)}`}>
                              {getSentimentLabel(brand.context)}
                            </span>
                          </div>
                        </div>
                        {brand.evidence.length > 0 && (
                          <div className="text-sm text-gray-600">
                            <p className="font-medium mb-1">Evidencia:</p>
                            <ul className="list-disc list-inside space-y-1">
                              {brand.evidence.slice(0, 3).map((evidence, evidenceIdx) => (
                                <li key={evidenceIdx}>{evidence}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === 'sources' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Respuestas de IA Analizadas</h3>
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <span>Total: {analysisResult?.totalSources || 0}</span>
                <span>Con menciones: {analysisResult?.brandSummary?.targetBrands?.filter(brand => brand.mentioned).length || 0}</span>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <Info className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900 mb-1">Sobre las Respuestas de IA</h4>
                  <p className="text-sm text-blue-800">
                    Cada respuesta fue generada por un modelo de IA actuando como experto en el sector, 
                    respondiendo de forma natural a las preguntas planteadas. Posteriormente, estas respuestas 
                    fueron analizadas para detectar menciones de marca y evaluar el contexto.
                  </p>
                </div>
              </div>
            </div>

            {/* Respuestas agrupadas por pregunta */}
            {analysisResult?.questions?.map((question, index) => (
              <div key={question.questionId} className="border rounded-lg">
                <button
                  onClick={() => toggleSection(`source-${question.questionId}`)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center">
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium mr-3">
                        {index + 1}
                      </span>
                      <h4 className="font-medium text-gray-900">{question.category}</h4>
                      <span className="ml-3 text-xs text-gray-500">
                        {question.brandMentions.filter(m => m.mentioned).length} menciones detectadas
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 ml-12">{question.question}</p>
                  </div>
                  {expandedSections.has(`source-${question.questionId}`) ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                </button>
                
                {expandedSections.has(`source-${question.questionId}`) && (
                  <div className="border-t p-4">
                    {question.sources.map((source, sourceIndex) => (
                      <div key={sourceIndex} className="bg-gray-50 rounded-lg p-4 mb-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center mb-2">
                              <h5 className="font-medium text-gray-900 mr-2">Respuesta de IA Generativa</h5>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {source.domain || 'ChatGPT'}
                              </span>
                            </div>
                            <div className="bg-white rounded-lg p-3 border">
                              <p className="text-sm text-gray-700 leading-relaxed">{source.snippet}</p>
                            </div>
                            
                            {/* Fuentes utilizadas por ChatGPT */}
                            {question.sources.length > 1 && (
                              <div className="mt-3">
                                <h6 className="text-xs font-medium text-gray-700 mb-2 flex items-center">
                                  <BookOpen className="h-3 w-3 mr-1" />
                                  Fuentes consultadas por ChatGPT:
                                </h6>
                                <div className="space-y-1">
                                  {question.sources.slice(1).map((refSource, refIndex) => (
                                    <div key={refIndex} className="bg-blue-50 border border-blue-200 rounded p-2">
                                      <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                          <div className="flex items-center mb-1">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mr-2 ${
                                              refSource.isPriority ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600'
                                            }`}>
                                              {refSource.isPriority ? 'Prioritaria' : 'General'}
                                            </span>
                                            <span className="text-xs text-gray-500">{refSource.domain}</span>
                                          </div>
                                          <h6 className="font-medium text-blue-900 text-sm">{refSource.title}</h6>
                                          <p className="text-xs text-blue-800 mt-1">{refSource.snippet}</p>
                                        </div>
                                        {refSource.url && refSource.url !== 'generative-ai-response' && refSource.url !== 'ai-generated' && refSource.url !== 'ai-generated-response' && (
                                          <a
                                            href={refSource.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="ml-2 text-blue-600 hover:text-blue-800"
                                            title="Ver fuente original"
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* Mostrar menciones detectadas en esta respuesta */}
                            {question.brandMentions.length > 0 && (
                              <div className="mt-3">
                                <h6 className="text-xs font-medium text-gray-700 mb-2">Menciones detectadas en esta respuesta:</h6>
                                <div className="flex flex-wrap gap-2">
                                  {question.brandMentions.filter(m => m.mentioned).map((mention, mentionIdx) => (
                                    <span key={mentionIdx} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                      {mention.brand} ({mention.frequency})
                                    </span>
                                  ))}
                                  {question.brandMentions.filter(m => !m.mentioned).length > 0 && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                      {question.brandMentions.filter(m => !m.mentioned).length} marcas no mencionadas
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'models' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Comparación entre Modelos de IA</h3>
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <span>Modelos analizados: {analysisResult?.questions?.reduce((acc, q) => {
                  const models = new Set(q.multiModelAnalysis?.map(m => m.modelPersona) || []);
                  return Math.max(acc, models.size);
                }, 0) || 0}</span>
              </div>
            </div>

            {/* Resumen de modelos */}
            {analysisResult?.questions?.some(q => q.multiModelAnalysis && q.multiModelAnalysis.length > 0) ? (
              <div className="space-y-6">
                {/* Comparación general de sentimientos */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Análisis de Sentimiento por Modelo</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {['chatgpt', 'claude', 'gemini', 'perplexity'].map(model => {
                      const modelAnalyses = analysisResult.questions
                        .flatMap(q => q.multiModelAnalysis || [])
                        .filter(m => m.modelPersona === model);
                      
                      if (modelAnalyses.length === 0) return null;

                      const avgSentiment = modelAnalyses.reduce((sum, analysis) => {
                        const sentimentScore = analysis.overallSentiment === 'very_positive' ? 2 :
                                             analysis.overallSentiment === 'positive' ? 1 :
                                             analysis.overallSentiment === 'neutral' ? 0 :
                                             analysis.overallSentiment === 'negative' ? -1 : -2;
                        return sum + sentimentScore;
                      }, 0) / modelAnalyses.length;

                      const avgSentimentLabel = avgSentiment > 1.5 ? 'very_positive' :
                                              avgSentiment > 0.5 ? 'positive' :
                                              avgSentiment > -0.5 ? 'neutral' :
                                              avgSentiment > -1.5 ? 'negative' : 'very_negative';

                      return (
                        <div key={model} className="bg-white rounded-lg p-3 border">
                          <div className="flex items-center mb-2">
                            <span className="text-lg mr-2">{getModelPersonaIcon(model)}</span>
                            <span className="font-medium text-gray-900">{getModelPersonaName(model)}</span>
                          </div>
                          <div className="text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSentimentColor(avgSentimentLabel)}`}>
                              {getSentimentLabel(avgSentimentLabel)}
                            </span>
                            <p className="text-xs text-gray-600 mt-1">{modelAnalyses.length} análisis</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Comparación por pregunta */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Comparación Detallada por Pregunta</h4>
                  {analysisResult.questions
                    .filter(q => q.multiModelAnalysis && q.multiModelAnalysis.length > 0)
                    .map((question, index) => (
                    <div key={question.questionId} className="border rounded-lg">
                      <button
                        onClick={() => toggleSection(`model-comparison-${question.questionId}`)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center">
                            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-medium mr-3">
                              {index + 1}
                            </span>
                            <h5 className="font-medium text-gray-900">{question.category}</h5>
                            <span className="ml-3 text-xs text-gray-500">
                              {question.multiModelAnalysis?.length || 0} modelos
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1 ml-12">{question.question}</p>
                        </div>
                        {expandedSections.has(`model-comparison-${question.questionId}`) ? (
                          <ChevronDown className="h-5 w-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-gray-400" />
                        )}
                      </button>
                      
                      {expandedSections.has(`model-comparison-${question.questionId}`) && (
                        <div className="border-t p-4">
                          <div className="grid gap-4">
                            {question.multiModelAnalysis?.map((modelAnalysis, idx) => (
                              <div key={idx} className="bg-gray-50 rounded-lg p-4 border">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center">
                                    <span className="text-xl mr-3">{getModelPersonaIcon(modelAnalysis.modelPersona)}</span>
                                    <div>
                                      <h6 className="font-medium text-gray-900">{getModelPersonaName(modelAnalysis.modelPersona)}</h6>
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSentimentColor(modelAnalysis.overallSentiment)}`}>
                                        {getSentimentLabel(modelAnalysis.overallSentiment)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right text-xs text-gray-600">
                                    <div>Menciones: {modelAnalysis.brandMentions.filter(m => m.mentioned).length}</div>
                                    <div>Total marcas: {modelAnalysis.brandMentions.length}</div>
                                  </div>
                                </div>
                                
                                <div className="mb-3">
                                  <h6 className="text-sm font-medium text-gray-900 mb-1">Insights Contextuales:</h6>
                                  <p className="text-sm text-gray-700">{modelAnalysis.contextualInsights}</p>
                                </div>

                                <div className="mb-3">
                                  <h6 className="text-sm font-medium text-gray-900 mb-2">Respuesta Generada:</h6>
                                  <div className="bg-white rounded p-3 border text-sm text-gray-700 max-h-32 overflow-y-auto">
                                    {modelAnalysis.generatedContent}
                                  </div>
                                </div>

                                {modelAnalysis.brandMentions.filter(m => m.mentioned).length > 0 && (
                                  <div>
                                    <h6 className="text-sm font-medium text-gray-900 mb-2">Menciones Detectadas:</h6>
                                    <div className="flex flex-wrap gap-2">
                                      {modelAnalysis.brandMentions
                                        .filter(m => m.mentioned)
                                        .map((mention, mentionIdx) => (
                                        <div key={mentionIdx} className="bg-white rounded px-3 py-1 border text-xs">
                                          <span className="font-medium">{mention.brand}</span>
                                          <span className={`ml-2 px-2 py-1 rounded-full ${getSentimentColor(mention.context)}`}>
                                            {getSentimentLabel(mention.context)}
                                          </span>
                                          <span className="ml-1 text-gray-600">({mention.frequency}x)</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No hay análisis multi-modelo disponible</h3>
                <p className="text-gray-500">Este análisis no incluye comparación entre múltiples modelos de IA.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisResultsViewer;