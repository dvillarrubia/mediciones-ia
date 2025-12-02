import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config/api';
import { ArrowRight, ArrowUp, ArrowDown, Minus, TrendingUp, TrendingDown, HelpCircle } from 'lucide-react';
import { useProjectStore } from '../store/projectStore';

interface Analysis {
  id: string;
  timestamp: string;
  name: string;
  targetBrand: string;
  questionsCount: number;
  overallConfidence: number;
  brandSummary: Array<{
    brand: string;
    mentioned: boolean;
    frequency: number;
    sentiment?: string;
  }>;
}

interface ComparisonDiff {
  mentions: Array<{ brand: string; diff: number; before: number; after: number }>;
  sentiment: Array<{ brand: string; before: string; after: string }>;
  shareOfVoice: Array<{ brand: string; change: number }>;
  confidenceChange: number;
}

// Helper para convertir brandSummary de objeto a array
const transformBrandSummary = (brandSummaryObj: any): Analysis['brandSummary'] => {
  if (!brandSummaryObj) return [];

  if (Array.isArray(brandSummaryObj)) {
    // Ya es un array (formato antiguo)
    return brandSummaryObj;
  }

  // Es un objeto con targetBrands y competitors
  const targetBrands = brandSummaryObj.targetBrands || [];
  const competitors = brandSummaryObj.competitors || [];
  return [...targetBrands, ...competitors].map((b: any) => ({
    brand: b.brand,
    mentioned: b.mentioned,
    frequency: b.frequency,
    sentiment: b.context || b.sentiment
  }));
};

export default function Comparator() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedAnalysis1, setSelectedAnalysis1] = useState<string>('');
  const [selectedAnalysis2, setSelectedAnalysis2] = useState<string>('');
  const [analysis1Data, setAnalysis1Data] = useState<Analysis | null>(null);
  const [analysis2Data, setAnalysis2Data] = useState<Analysis | null>(null);
  const [comparison, setComparison] = useState<ComparisonDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const { selectedProjectId } = useProjectStore();

  useEffect(() => {
    loadAnalyses();
    // Reset selections when project changes
    setSelectedAnalysis1('');
    setSelectedAnalysis2('');
    setAnalysis1Data(null);
    setAnalysis2Data(null);
    setComparison(null);
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedAnalysis1 && selectedAnalysis2) {
      compareAnalyses();
    }
  }, [selectedAnalysis1, selectedAnalysis2]);

  const loadAnalyses = async () => {
    try {
      setLoading(true);
      let url = API_ENDPOINTS.analysisSaved;
      if (selectedProjectId) {
        url += `?projectId=${selectedProjectId}`;
      }
      const response = await fetch(url);
      const data = await response.json();

      if (data.success && data.data) {
        const transformedAnalyses: Analysis[] = data.data.map((analysis: any) => {
          // Los datos vienen del endpoint /saved que tiene estructura diferente
          const targetBrand = analysis.targetBrand || analysis.configuration?.brand || 'Análisis';
          const questionsCount = analysis.questionsCount || analysis.configuration?.questionsCount || 0;
          const displayName = `${targetBrand} (${questionsCount} preguntas)`;

          return {
            id: analysis.id,
            timestamp: analysis.timestamp,
            name: displayName,
            targetBrand,
            questionsCount,
            overallConfidence: (analysis.overallConfidence || analysis.results?.overallConfidence || 0) * 100,
            brandSummary: transformBrandSummary(analysis.results?.brandSummary)
          };
        });

        setAnalyses(transformedAnalyses);
      }
    } catch (error) {
      console.error('Error loading analyses:', error);
    } finally {
      setLoading(false);
    }
  };

  const compareAnalyses = async () => {
    try {
      // Cargar datos completos de ambos análisis
      const [response1, response2] = await Promise.all([
        fetch(`${API_ENDPOINTS.analysisSaved}/${selectedAnalysis1}`),
        fetch(`${API_ENDPOINTS.analysisSaved}/${selectedAnalysis2}`)
      ]);

      const [data1, data2] = await Promise.all([
        response1.json(),
        response2.json()
      ]);

      if (data1.success && data2.success) {
        const brand1 = data1.data.configuration?.brand || data1.data.targetBrand || 'Análisis';
        const questionsCount1 = data1.data.configuration?.questionsCount || data1.data.questionsCount || 0;
        const analysis1 = {
          id: data1.data.id,
          timestamp: data1.data.timestamp,
          name: `${brand1} (${questionsCount1} preguntas)`,
          targetBrand: brand1,
          questionsCount: questionsCount1,
          overallConfidence: (data1.data.results?.overallConfidence || 0) * 100,
          brandSummary: transformBrandSummary(data1.data.results?.brandSummary)
        };

        const brand2 = data2.data.configuration?.brand || data2.data.targetBrand || 'Análisis';
        const questionsCount2 = data2.data.configuration?.questionsCount || data2.data.questionsCount || 0;
        const analysis2 = {
          id: data2.data.id,
          timestamp: data2.data.timestamp,
          name: `${brand2} (${questionsCount2} preguntas)`,
          targetBrand: brand2,
          questionsCount: questionsCount2,
          overallConfidence: (data2.data.results?.overallConfidence || 0) * 100,
          brandSummary: transformBrandSummary(data2.data.results?.brandSummary)
        };

        setAnalysis1Data(analysis1);
        setAnalysis2Data(analysis2);

        // Calcular diferencias
        const diff = calculateDifferences(analysis1, analysis2);
        setComparison(diff);
      }
    } catch (error) {
      console.error('Error comparing analyses:', error);
    }
  };

  const calculateDifferences = (analysis1: Analysis, analysis2: Analysis): ComparisonDiff => {
    // Menciones
    const brandMap = new Map<string, { before: number; after: number }>();

    analysis1.brandSummary.forEach(b => {
      if (b.mentioned) {
        brandMap.set(b.brand, { before: b.frequency, after: 0 });
      }
    });

    analysis2.brandSummary.forEach(b => {
      if (b.mentioned) {
        const existing = brandMap.get(b.brand);
        if (existing) {
          existing.after = b.frequency;
        } else {
          brandMap.set(b.brand, { before: 0, after: b.frequency });
        }
      }
    });

    const mentions = Array.from(brandMap.entries())
      .map(([brand, data]) => ({
        brand,
        before: data.before,
        after: data.after,
        diff: data.after - data.before
      }))
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    // Sentimiento
    const sentimentMap = new Map<string, { before: string; after: string }>();

    analysis1.brandSummary.forEach(b => {
      if (b.mentioned && b.sentiment) {
        sentimentMap.set(b.brand, { before: b.sentiment, after: '' });
      }
    });

    analysis2.brandSummary.forEach(b => {
      if (b.mentioned && b.sentiment) {
        const existing = sentimentMap.get(b.brand);
        if (existing) {
          existing.after = b.sentiment;
        } else {
          sentimentMap.set(b.brand, { before: '', after: b.sentiment });
        }
      }
    });

    const sentiment = Array.from(sentimentMap.entries())
      .filter(([_, data]) => data.before && data.after && data.before !== data.after)
      .map(([brand, data]) => ({
        brand,
        before: data.before,
        after: data.after
      }));

    // Share of Voice
    const totalBefore = analysis1.brandSummary.reduce((sum, b) => sum + (b.mentioned ? b.frequency : 0), 0);
    const totalAfter = analysis2.brandSummary.reduce((sum, b) => sum + (b.mentioned ? b.frequency : 0), 0);

    const shareOfVoice = Array.from(brandMap.entries())
      .map(([brand, data]) => {
        const sovBefore = totalBefore > 0 ? (data.before / totalBefore) * 100 : 0;
        const sovAfter = totalAfter > 0 ? (data.after / totalAfter) * 100 : 0;
        return {
          brand,
          change: sovAfter - sovBefore
        };
      })
      .filter(item => Math.abs(item.change) > 0.1)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    return {
      mentions,
      sentiment,
      shareOfVoice,
      confidenceChange: analysis2.overallConfidence - analysis1.overallConfidence
    };
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDiffIcon = (diff: number) => {
    if (diff > 0) return <ArrowUp className="h-4 w-4 text-green-600" />;
    if (diff < 0) return <ArrowDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-600" />;
  };

  const getDiffColor = (diff: number) => {
    if (diff > 0) return 'text-green-600';
    if (diff < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-lg">Cargando análisis...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Comparador de Análisis</h1>

        {/* Selectores */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-8">
          <h2 className="text-lg font-semibold mb-4">Seleccionar Análisis a Comparar</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Análisis 1 (Base)
              </label>
              <select
                value={selectedAnalysis1}
                onChange={(e) => setSelectedAnalysis1(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccionar análisis...</option>
                {analyses.map(analysis => (
                  <option key={analysis.id} value={analysis.id}>
                    {analysis.name} - {formatDate(analysis.timestamp)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Análisis 2 (Comparar con)
              </label>
              <select
                value={selectedAnalysis2}
                onChange={(e) => setSelectedAnalysis2(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccionar análisis...</option>
                {analyses.filter(a => a.id !== selectedAnalysis1).map(analysis => (
                  <option key={analysis.id} value={analysis.id}>
                    {analysis.name} - {formatDate(analysis.timestamp)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Comparación */}
        {analysis1Data && analysis2Data && comparison && (
          <>
            {/* Resumen Side-by-Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow-sm border-2 border-blue-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Análisis 1 (Base)</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-gray-500">Nombre:</span>
                    <p className="text-gray-900 font-medium">{analysis1Data.name}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Marca:</span>
                    <p className="text-gray-900">{analysis1Data.targetBrand}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Fecha:</span>
                    <p className="text-gray-900">{formatDate(analysis1Data.timestamp)}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Preguntas:</span>
                    <p className="text-gray-900">{analysis1Data.questionsCount}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500 flex items-center gap-1">
                      Confianza:
                      <span className="relative group">
                        <HelpCircle className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 z-10 pointer-events-none">
                          Promedio de confianza de cada pregunta. La IA asigna un valor (0-100%) segun la claridad de las menciones encontradas, la consistencia del analisis y la calidad de la evidencia textual.
                        </span>
                      </span>
                    </span>
                    <p className="text-gray-900">{analysis1Data.overallConfidence.toFixed(1)}%</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border-2 border-green-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Analisis 2 (Comparar)</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-gray-500">Nombre:</span>
                    <p className="text-gray-900 font-medium">{analysis2Data.name}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Marca:</span>
                    <p className="text-gray-900">{analysis2Data.targetBrand}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Fecha:</span>
                    <p className="text-gray-900">{formatDate(analysis2Data.timestamp)}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Preguntas:</span>
                    <p className="text-gray-900">{analysis2Data.questionsCount}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500 flex items-center gap-1">
                      Confianza:
                      <span className="relative group">
                        <HelpCircle className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 z-10 pointer-events-none">
                          Promedio de confianza de cada pregunta. La IA asigna un valor (0-100%) segun la claridad de las menciones encontradas, la consistencia del analisis y la calidad de la evidencia textual.
                        </span>
                      </span>
                    </span>
                    <p className="text-gray-900 flex items-center gap-2">
                      {analysis2Data.overallConfidence.toFixed(1)}%
                      <span className={`text-sm ${getDiffColor(comparison.confidenceChange)}`}>
                        ({comparison.confidenceChange > 0 ? '+' : ''}{comparison.confidenceChange.toFixed(1)}%)
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Cambios en Menciones */}
            <div className="bg-white p-6 rounded-lg shadow-sm mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Cambios en Menciones de Marca</h3>
              {comparison.mentions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Marca</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Antes</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase"></th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Después</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cambio</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {comparison.mentions.map((item, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {item.brand}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {item.before}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <ArrowRight className="h-4 w-4 text-gray-400 mx-auto" />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {item.after}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {getDiffIcon(item.diff)}
                              <span className={`text-sm font-medium ${getDiffColor(item.diff)}`}>
                                {item.diff > 0 ? '+' : ''}{item.diff}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No hay cambios significativos en las menciones</p>
              )}
            </div>

            {/* Cambios en Share of Voice */}
            {comparison.shareOfVoice.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow-sm mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Cambios en Share of Voice</h3>
                <div className="space-y-3">
                  {comparison.shareOfVoice.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium text-gray-900">{item.brand}</span>
                      <div className="flex items-center gap-2">
                        {getDiffIcon(item.change)}
                        <span className={`font-semibold ${getDiffColor(item.change)}`}>
                          {item.change > 0 ? '+' : ''}{item.change.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cambios en Sentimiento */}
            {comparison.sentiment.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Cambios en Sentimiento</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {comparison.sentiment.map((item, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <p className="font-medium text-gray-900 mb-2">{item.brand}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">{item.before}</span>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">{item.after}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!selectedAnalysis1 || !selectedAnalysis2 && (
          <div className="text-center py-12 text-gray-500">
            Seleccione dos análisis para comparar
          </div>
        )}
      </div>
    </div>
  );
}
