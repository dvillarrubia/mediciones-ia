import React, { useState } from 'react';
import {
  FileText,
  Download,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  TrendingUp,
  Target,
  AlertCircle,
  CheckCircle,
  Info,
  Sparkles
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
  appearanceOrder?: number;
  isDiscovered?: boolean;
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
  response?: string;
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
    otherCompetitors?: BrandMention[];
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
  onDownload: (format: 'pdf' | 'excel') => void;
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

  if (!analysisResult) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay resultados disponibles</h3>
            <p className="text-gray-500">Los datos del analisis no estan disponibles o no se han cargado correctamente.</p>
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
    { id: 'questions', label: 'Analisis por Pregunta', icon: FileText },
  ];

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

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Resultados del Analisis</h2>
            <p className="text-blue-100 text-sm mt-1">
              ID: {analysisResult?.analysisId || 'N/A'} - {analysisResult?.timestamp ? new Date(analysisResult.timestamp).toLocaleString() : 'N/A'}
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => onDownload('pdf')}
              className="flex items-center px-3 py-2 bg-white/10 text-white rounded-md hover:bg-white/20 transition-colors text-sm"
            >
              <Download className="h-4 w-4 mr-2" />
              PDF
            </button>
            <button
              onClick={() => onDownloadTable ? onDownloadTable() : onDownload('excel')}
              className="flex items-center px-3 py-2 bg-white/10 text-white rounded-md hover:bg-white/20 transition-colors text-sm"
            >
              <Download className="h-4 w-4 mr-2" />
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* Success Banner */}
      <div className="bg-green-50 border-b border-green-200 px-6 py-3">
        <div className="flex items-center">
          <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
          <span className="text-green-700 font-medium">
            Analisis completado exitosamente
          </span>
          {configurationName && (
            <span className="text-green-600 ml-2">- Configuracion: {configurationName}</span>
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
                onClick={() => setActiveTab(tab.id)}
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
            {/* Metricas principales - Solo 2 cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>

            {/* Resumen ejecutivo */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Info className="h-5 w-5 text-blue-600 mr-2" />
                Resumen del Analisis de IA Generativa
              </h3>
              <div className="prose prose-sm max-w-none">
                <p className="text-gray-700 mb-4">
                  Este analisis evalua la presencia de tu marca en las respuestas generadas por inteligencia artificial.
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
                  <strong>Metodologia:</strong> Cada pregunta fue enviada a un modelo de IA generativa actuando como experto en tu sector.
                  Las respuestas obtenidas fueron posteriormente analizadas para identificar menciones de marca,
                  frecuencia de aparicion y contexto de las menciones.
                </p>
              </div>
            </div>

            {/* Resumen de categorias */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-3">Categorias Analizadas</h3>
              <div className="flex flex-wrap gap-2">
                {analysisResult?.categories?.map((category) => (
                  <span
                    key={category}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                  >
                    {category}
                  </span>
                )) || (
                  <span className="text-gray-500 text-sm">No hay categorias disponibles</span>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                Analisis Detallado por Pregunta
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
                  </div>
                  {expandedSections.has(`question-${question.questionId}`) ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                </button>

                {expandedSections.has(`question-${question.questionId}`) && (
                  <div className="border-t p-4 space-y-4">
                    {/* Seccion 1: Respuesta Completa de ChatGPT */}
                    <div>
                      <h5 className="font-medium text-gray-900 mb-2 flex items-center">
                        Respuesta Completa de ChatGPT
                      </h5>
                      <div className="bg-gray-50 rounded-lg p-4 border text-sm text-gray-700 max-h-64 overflow-y-auto whitespace-pre-wrap">
                        {question.multiModelAnalysis?.[0]?.response || question.summary || 'Respuesta no disponible'}
                      </div>
                    </div>

                    {/* Seccion 2: Ranking por Orden de Aparicion */}
                    {question.brandMentions?.filter(m => m.mentioned).length > 0 && (
                      <div>
                        <h5 className="font-medium text-gray-900 mb-3 flex items-center">
                          Ranking por Orden de Aparicion
                          <span className="ml-2 text-xs text-gray-500 font-normal">
                            (posicion en la que aparece cada marca en la respuesta)
                          </span>
                        </h5>
                        <div className="bg-gray-50 rounded-lg border overflow-hidden">
                          <table className="min-w-full">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Pos.</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Marca</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Tipo</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Sentimiento</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {question.brandMentions
                                .filter(m => m.mentioned)
                                .sort((a, b) => (a.appearanceOrder || 999) - (b.appearanceOrder || 999))
                                .map((brand, idx) => {
                                  const position = brand.appearanceOrder || idx + 1;
                                  const getMedalEmoji = (pos: number) => {
                                    if (pos === 1) return '\u{1F947}';
                                    if (pos === 2) return '\u{1F948}';
                                    if (pos === 3) return '\u{1F949}';
                                    return `#${pos}`;
                                  };

                                  const isTargetBrand = analysisResult?.brandSummary?.targetBrands?.some(t => t.brand === brand.brand);
                                  const brandType = brand.isDiscovered ? 'Descubierto' : (isTargetBrand ? 'Objetivo' : 'Competidor');
                                  const typeColorClass = brand.isDiscovered
                                    ? 'bg-purple-100 text-purple-800'
                                    : (isTargetBrand ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800');

                                  return (
                                    <tr key={idx} className={idx === 0 ? 'bg-yellow-50' : 'bg-white'}>
                                      <td className="px-4 py-2">
                                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
                                          idx === 0 ? 'bg-yellow-400 text-yellow-900' :
                                          idx === 1 ? 'bg-gray-300 text-gray-800' :
                                          idx === 2 ? 'bg-orange-300 text-orange-900' :
                                          'bg-gray-100 text-gray-600'
                                        }`}>
                                          {getMedalEmoji(position)}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2">
                                        <span className="font-medium text-gray-900">{brand.brand}</span>
                                        {brand.isDiscovered && (
                                          <Sparkles className="h-3 w-3 text-purple-500 ml-1 inline" title="Descubierta por IA" />
                                        )}
                                      </td>
                                      <td className="px-4 py-2">
                                        <span className={`px-2 py-1 text-xs rounded-full ${typeColorClass}`}>
                                          {brandType}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2">
                                        <span className={`px-2 py-1 text-xs rounded-full ${getSentimentColor(brand.detailedSentiment || brand.context)}`}>
                                          {getSentimentLabel(brand.detailedSentiment || brand.context)}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Seccion 3: Fuentes Web */}
                    {(() => {
                      const webSources = question.sources.filter(s =>
                        s.url &&
                        s.url.startsWith('http') &&
                        !s.url.includes('ai-generated') &&
                        !s.url.includes('generative')
                      );

                      if (webSources.length === 0) return null;

                      return (
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2 flex items-center">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Fuentes Web ({webSources.length})
                          </h5>
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <ul className="space-y-1">
                              {webSources.map((source, sourceIndex) => (
                                <li key={sourceIndex} className="flex items-start text-sm">
                                  <span className="text-green-600 mr-2">-</span>
                                  <div className="flex-1 min-w-0">
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-green-700 hover:text-green-900 hover:underline break-all"
                                    >
                                      {source.title || source.url}
                                    </a>
                                    {source.domain && (
                                      <span className="text-green-600 text-xs ml-2">({source.domain})</span>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisResultsViewer;
