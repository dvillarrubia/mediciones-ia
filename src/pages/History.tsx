import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Eye,
  Trash2,
  Filter,
  Calendar,
  Tag,
  TrendingUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  GitCompare,
  X,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sparkles
} from 'lucide-react';

interface SavedAnalysis {
  id: string;
  timestamp: string;
  targetBrand: string;
  configurationName: string;
  templateUsed: string;
  status: string;
  categories: string[];
  summary: string;
  overallConfidence: number;
  modelsUsed: string[];
  questionsCount: number;
}

interface AnalysisDetail {
  id: string;
  timestamp: string;
  configuration: {
    brand: string;
    competitors: string[];
    templateId: string;
    questionsCount: number;
  };
  results: {
    analysisId: string;
    timestamp: string;
    questions: QuestionAnalysis[];
    overallConfidence: number;
    totalSources: number;
    prioritySources: number;
    brandSummary: {
      targetBrands: BrandMention[];
      competitors: BrandMention[];
      otherCompetitors?: BrandMention[];  // Competidores descubiertos por IA
    };
  };
  metadata?: {
    duration?: number;
    modelsUsed?: string[];
    totalQuestions?: number;
  };
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

interface AnalysisSource {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  isPriority: boolean;
  fullContent?: string;
}

interface BrandMention {
  brand: string;
  mentioned: boolean;
  frequency: number;
  context: string;
  evidence: string[];
  // Campos para tracking de aparicion
  appearanceOrder?: number;
  isDiscovered?: boolean;
}

type SortField = 'timestamp' | 'targetBrand' | 'overallConfidence' | 'questionsCount';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE = 10;

const History: React.FC = () => {
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'detail' | 'compare'>('list');
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

  // Filtros mejorados
  const [filterBrand, setFilterBrand] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterConfidenceMin, setFilterConfidenceMin] = useState<number>(0);
  const [filterConfidenceMax, setFilterConfidenceMax] = useState<number>(100);
  const [showFilters, setShowFilters] = useState(false);

  // Ordenamiento
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);

  // Comparación
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [compareAnalyses, setCompareAnalyses] = useState<AnalysisDetail[]>([]);

  // Estados de UI
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadAnalyses();
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
  };

  const loadAnalyses = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3003/api/analysis/saved');
      const data = await response.json();

      if (data.success) {
        setAnalyses(data.data);
      } else {
        showNotification('error', 'Error al cargar análisis');
      }
    } catch (error) {
      console.error('Error loading analyses:', error);
      showNotification('error', 'Error de conexión al cargar análisis');
    } finally {
      setLoading(false);
    }
  };

  const loadAnalysisDetail = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:3003/api/analysis/saved/${id}`);
      const data = await response.json();

      if (data.success) {
        setSelectedAnalysis(data.data);
        setViewMode('detail');
      } else {
        showNotification('error', 'Error al cargar detalle');
      }
    } catch (error) {
      console.error('Error loading analysis detail:', error);
      showNotification('error', 'Error de conexión');
    }
  };

  const deleteAnalysis = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este análisis? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      setDeletingId(id);
      const response = await fetch(`http://localhost:3003/api/analysis/saved/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (data.success) {
        setAnalyses(prev => prev.filter(a => a.id !== id));
        setCompareIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
        showNotification('success', 'Análisis eliminado correctamente');
      } else {
        showNotification('error', data.error || 'Error al eliminar');
      }
    } catch (error) {
      console.error('Error deleting analysis:', error);
      showNotification('error', 'Error de conexión al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const generateMarkdownReport = async (analysisId: string) => {
    try {
      setExportingId(analysisId);
      const response = await fetch(`http://localhost:3003/api/analysis/saved/${analysisId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await fetch('http://localhost:3003/api/analysis/report/markdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysisResult: data.data.results })
        });

        const reportData = await reportResponse.json();

        if (reportData.success) {
          const blob = new Blob([reportData.data.content], { type: 'text/markdown' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = reportData.data.filename;
          a.click();
          window.URL.revokeObjectURL(url);
          showNotification('success', 'Reporte MD descargado');
        }
      }
    } catch (error) {
      console.error('Error generating markdown report:', error);
      showNotification('error', 'Error al generar reporte');
    } finally {
      setExportingId(null);
    }
  };

  const generateJSONReport = async (analysisId: string) => {
    try {
      setExportingId(analysisId);
      const response = await fetch(`http://localhost:3003/api/analysis/saved/${analysisId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await fetch('http://localhost:3003/api/analysis/report/json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysisResult: data.data.results })
        });

        const reportData = await reportResponse.json();

        if (reportData.success) {
          const blob = new Blob([JSON.stringify(reportData.data.content, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = reportData.data.filename;
          a.click();
          window.URL.revokeObjectURL(url);
          showNotification('success', 'Reporte JSON descargado');
        }
      }
    } catch (error) {
      console.error('Error generating JSON report:', error);
      showNotification('error', 'Error al generar reporte');
    } finally {
      setExportingId(null);
    }
  };

  const generateExcelReport = async (analysisId: string) => {
    try {
      setExportingId(analysisId);
      const response = await fetch(`http://localhost:3003/api/analysis/saved/${analysisId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await fetch('http://localhost:3003/api/analysis/report/excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysisResult: data.data.results,
            configuration: data.data.configuration
          })
        });

        if (reportResponse.ok) {
          const blob = await reportResponse.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `analysis-${analysisId}.xlsx`;
          a.click();
          window.URL.revokeObjectURL(url);
          showNotification('success', 'Reporte Excel descargado');
        }
      }
    } catch (error) {
      console.error('Error generating Excel report:', error);
      showNotification('error', 'Error al generar Excel');
    } finally {
      setExportingId(null);
    }
  };

  const toggleQuestionExpand = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId);
    } else {
      newExpanded.add(questionId);
    }
    setExpandedQuestions(newExpanded);
  };

  const toggleCompareSelection = (id: string) => {
    const newSet = new Set(compareIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else if (newSet.size < 3) {
      newSet.add(id);
    } else {
      showNotification('error', 'Máximo 3 análisis para comparar');
    }
    setCompareIds(newSet);
  };

  const startComparison = async () => {
    if (compareIds.size < 2) {
      showNotification('error', 'Selecciona al menos 2 análisis');
      return;
    }

    try {
      const details: AnalysisDetail[] = [];
      for (const id of compareIds) {
        const response = await fetch(`http://localhost:3003/api/analysis/saved/${id}`);
        const data = await response.json();
        if (data.success) {
          details.push(data.data);
        }
      }
      setCompareAnalyses(details);
      setViewMode('compare');
    } catch (error) {
      showNotification('error', 'Error al cargar análisis para comparar');
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilterBrand('');
    setFilterCategory('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterConfidenceMin(0);
    setFilterConfidenceMax(100);
    setCurrentPage(1);
  };

  // Obtener categorías únicas
  const uniqueCategories = useMemo(() => {
    const categories = new Set<string>();
    analyses.forEach(a => a.categories.forEach(c => categories.add(c)));
    return Array.from(categories).sort();
  }, [analyses]);

  // Filtrar y ordenar análisis
  const filteredAndSortedAnalyses = useMemo(() => {
    let result = [...analyses];

    // Aplicar filtros
    if (filterBrand) {
      result = result.filter(a =>
        a.targetBrand.toLowerCase().includes(filterBrand.toLowerCase())
      );
    }

    if (filterCategory) {
      result = result.filter(a =>
        a.categories.some(c => c.toLowerCase().includes(filterCategory.toLowerCase()))
      );
    }

    if (filterDateFrom) {
      const fromDate = new Date(filterDateFrom);
      result = result.filter(a => new Date(a.timestamp) >= fromDate);
    }

    if (filterDateTo) {
      const toDate = new Date(filterDateTo);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter(a => new Date(a.timestamp) <= toDate);
    }

    result = result.filter(a => {
      const confidence = a.overallConfidence * 100;
      return confidence >= filterConfidenceMin && confidence <= filterConfidenceMax;
    });

    // Ordenar
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'timestamp':
          comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case 'targetBrand':
          comparison = a.targetBrand.localeCompare(b.targetBrand);
          break;
        case 'overallConfidence':
          comparison = a.overallConfidence - b.overallConfidence;
          break;
        case 'questionsCount':
          comparison = a.questionsCount - b.questionsCount;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [analyses, filterBrand, filterCategory, filterDateFrom, filterDateTo, filterConfidenceMin, filterConfidenceMax, sortField, sortDirection]);

  // Paginación
  const totalPages = Math.ceil(filteredAndSortedAnalyses.length / ITEMS_PER_PAGE);
  const paginatedAnalyses = filteredAndSortedAnalyses.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const SortButton: React.FC<{ field: SortField; label: string }> = ({ field, label }) => (
    <button
      onClick={() => handleSort(field)}
      className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors ${sortField === field
          ? 'bg-blue-100 text-blue-700'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
    >
      {label}
      {sortField === field ? (
        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      )}
    </button>
  );

  // Skeleton loader
  const SkeletonCard = () => (
    <div className="bg-white p-6 rounded-lg shadow animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-6 bg-gray-200 rounded w-32"></div>
            <div className="h-5 bg-gray-200 rounded w-20"></div>
          </div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="flex gap-4">
            <div className="h-4 bg-gray-200 rounded w-28"></div>
            <div className="h-4 bg-gray-200 rounded w-20"></div>
            <div className="h-4 bg-gray-200 rounded w-24"></div>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-10 bg-gray-200 rounded w-24"></div>
          <div className="h-10 bg-gray-200 rounded w-12"></div>
        </div>
      </div>
    </div>
  );

  // Notificación
  const Notification = () => {
    if (!notification) return null;

    return (
      <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg transition-all duration-300 ${notification.type === 'success'
          ? 'bg-green-500 text-white'
          : 'bg-red-500 text-white'
        }`}>
        {notification.type === 'success' ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : (
          <AlertCircle className="w-5 h-5" />
        )}
        <span>{notification.message}</span>
        <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-75">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 bg-gray-200 rounded w-64 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-48 mt-2 animate-pulse"></div>
          </div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  // Vista de comparación
  if (viewMode === 'compare' && compareAnalyses.length >= 2) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Notification />

        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => { setViewMode('list'); setCompareAnalyses([]); }}
              className="text-blue-600 hover:text-blue-800 mb-2 flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Volver al listado
            </button>
            <h1 className="text-3xl font-bold">Comparación de Análisis</h1>
            <p className="text-gray-600">Comparando {compareAnalyses.length} análisis</p>
          </div>
        </div>

        {/* Tabla comparativa */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Métrica</th>
                {compareAnalyses.map(a => (
                  <th key={a.id} className="px-4 py-3 text-left font-semibold text-gray-700">
                    {a.configuration.brand}
                    <div className="text-xs font-normal text-gray-500">
                      {new Date(a.timestamp).toLocaleDateString('es-ES')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-4 py-3 font-medium">Confianza General</td>
                {compareAnalyses.map(a => (
                  <td key={a.id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${a.results.overallConfidence * 100}%` }}
                        />
                      </div>
                      <span className="font-semibold">{(a.results.overallConfidence * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50">
                <td className="px-4 py-3 font-medium">Preguntas Analizadas</td>
                {compareAnalyses.map(a => (
                  <td key={a.id} className="px-4 py-3 font-semibold">{a.results.questions.length}</td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium">Total Fuentes</td>
                {compareAnalyses.map(a => (
                  <td key={a.id} className="px-4 py-3 font-semibold">{a.results.totalSources}</td>
                ))}
              </tr>
              <tr className="bg-gray-50">
                <td className="px-4 py-3 font-medium">Fuentes Prioritarias</td>
                {compareAnalyses.map(a => (
                  <td key={a.id} className="px-4 py-3 font-semibold">{a.results.prioritySources}</td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium">Menciones de Marca</td>
                {compareAnalyses.map(a => (
                  <td key={a.id} className="px-4 py-3 font-semibold">
                    {a.results.brandSummary.targetBrands.filter(b => b.mentioned).length}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50">
                <td className="px-4 py-3 font-medium">Competidores Detectados</td>
                {compareAnalyses.map(a => (
                  <td key={a.id} className="px-4 py-3 font-semibold">
                    {a.results.brandSummary.competitors.filter(b => b.mentioned).length}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium">Modelos Usados</td>
                {compareAnalyses.map(a => (
                  <td key={a.id} className="px-4 py-3 text-sm">
                    {a.metadata?.modelsUsed?.join(', ') || 'ChatGPT'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Comparación de menciones por marca */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Menciones de Marca por Análisis</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {compareAnalyses.map(a => (
              <div key={a.id} className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3">{a.configuration.brand}</h3>
                <div className="space-y-2">
                  {a.results.brandSummary.targetBrands
                    .filter(b => b.mentioned)
                    .map(brand => (
                      <div key={brand.brand} className="flex justify-between items-center text-sm">
                        <span>{brand.brand}</span>
                        <span className="font-semibold text-blue-600">{brand.frequency} menciones</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Vista de detalle
  if (viewMode === 'detail' && selectedAnalysis) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Notification />

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <button
              onClick={() => { setViewMode('list'); setSelectedAnalysis(null); }}
              className="text-blue-600 hover:text-blue-800 mb-2 flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Volver al listado
            </button>
            <h1 className="text-3xl font-bold">Detalle del Análisis</h1>
            <p className="text-gray-600">
              {selectedAnalysis.configuration.brand} - {new Date(selectedAnalysis.timestamp).toLocaleString('es-ES')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => generateMarkdownReport(selectedAnalysis.id)}
              disabled={exportingId === selectedAnalysis.id}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              MD
            </button>
            <button
              onClick={() => generateJSONReport(selectedAnalysis.id)}
              disabled={exportingId === selectedAnalysis.id}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              JSON
            </button>
            <button
              onClick={() => generateExcelReport(selectedAnalysis.id)}
              disabled={exportingId === selectedAnalysis.id}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </button>
          </div>
        </div>

        {/* Métricas generales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow">
            <div className="text-sm text-gray-600">Preguntas Analizadas</div>
            <div className="text-2xl font-bold text-blue-600">{selectedAnalysis.results.questions.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow">
            <div className="text-sm text-gray-600">Confianza General</div>
            <div className="text-2xl font-bold text-green-600">
              {(selectedAnalysis.results.overallConfidence * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow">
            <div className="text-sm text-gray-600">Total Fuentes</div>
            <div className="text-2xl font-bold text-purple-600">{selectedAnalysis.results.totalSources}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow">
            <div className="text-sm text-gray-600">Modelos Usados</div>
            <div className="text-sm font-semibold mt-1 text-gray-700">
              {selectedAnalysis.metadata?.modelsUsed?.join(', ') || 'ChatGPT'}
            </div>
          </div>
        </div>

        {/* Menciones de marca */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Menciones de Marca
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Marcas Objetivo */}
            <div>
              <h3 className="font-semibold mb-2 text-blue-700 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-600"></span>
                Marcas Objetivo
              </h3>
              {selectedAnalysis.results.brandSummary.targetBrands
                .filter(b => b.mentioned)
                .sort((a, b) => (a.appearanceOrder || 999) - (b.appearanceOrder || 999))
                .map(brand => (
                  <div key={brand.brand} className="mb-2 p-3 bg-blue-50 rounded-lg border border-blue-100 hover:border-blue-200 transition-colors relative">
                    {brand.appearanceOrder && (
                      <span className="absolute -top-2 -left-2 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {brand.appearanceOrder}
                      </span>
                    )}
                    <div className="font-medium text-blue-800 ml-2">{brand.brand}</div>
                    <div className="text-sm text-blue-600 ml-2">
                      {brand.frequency} menciones - {brand.context}
                    </div>
                  </div>
                ))}
              {selectedAnalysis.results.brandSummary.targetBrands.filter(b => b.mentioned).length === 0 && (
                <div className="text-gray-500 italic">No se encontraron menciones</div>
              )}
            </div>

            {/* Competidores Configurados */}
            <div>
              <h3 className="font-semibold mb-2 text-orange-700 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                Competidores Configurados
              </h3>
              {selectedAnalysis.results.brandSummary.competitors
                .filter(b => b.mentioned)
                .sort((a, b) => (a.appearanceOrder || 999) - (b.appearanceOrder || 999))
                .map(brand => (
                  <div key={brand.brand} className="mb-2 p-3 bg-orange-50 rounded-lg border border-orange-100 hover:border-orange-200 transition-colors relative">
                    {brand.appearanceOrder && (
                      <span className="absolute -top-2 -left-2 bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {brand.appearanceOrder}
                      </span>
                    )}
                    <div className="font-medium text-orange-800 ml-2">{brand.brand}</div>
                    <div className="text-sm text-orange-600 ml-2">
                      {brand.frequency} menciones - {brand.context}
                    </div>
                  </div>
                ))}
              {selectedAnalysis.results.brandSummary.competitors.filter(b => b.mentioned).length === 0 && (
                <div className="text-gray-500 italic">No se encontraron menciones</div>
              )}
            </div>

            {/* Competidores Descubiertos */}
            <div>
              <h3 className="font-semibold mb-2 text-purple-700 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                Descubiertos por IA
                <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">Nuevo</span>
              </h3>
              {selectedAnalysis.results.brandSummary.otherCompetitors &&
               selectedAnalysis.results.brandSummary.otherCompetitors.filter(b => b.mentioned).length > 0 ? (
                selectedAnalysis.results.brandSummary.otherCompetitors
                  .filter(b => b.mentioned)
                  .sort((a, b) => (a.appearanceOrder || 999) - (b.appearanceOrder || 999))
                  .map(brand => (
                    <div key={brand.brand} className="mb-2 p-3 bg-purple-50 rounded-lg border border-purple-100 hover:border-purple-200 transition-colors relative">
                      {brand.appearanceOrder && (
                        <span className="absolute -top-2 -left-2 bg-purple-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                          {brand.appearanceOrder}
                        </span>
                      )}
                      <div className="font-medium text-purple-800 ml-2">{brand.brand}</div>
                      <div className="text-sm text-purple-600 ml-2">
                        {brand.frequency} menciones - {brand.context}
                      </div>
                    </div>
                  ))
              ) : (
                <div className="text-gray-500 italic p-3 bg-gray-50 rounded-lg">
                  No se descubrieron marcas adicionales
                </div>
              )}
            </div>
          </div>

          {/* Leyenda de orden */}
          <div className="mt-4 pt-4 border-t text-sm text-gray-600">
            <span className="font-medium">Orden de aparicion:</span> Los numeros indican el orden en que cada marca fue mencionada en las respuestas de la IA (1 = primera mencion).
          </div>
        </div>

        {/* Preguntas detalladas */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Análisis Detallado por Pregunta
          </h2>
          <div className="space-y-4">
            {selectedAnalysis.results.questions.map((question, index) => (
              <div key={question.questionId} className="border rounded-lg overflow-hidden hover:border-blue-200 transition-colors">
                <div
                  className="flex items-start justify-between cursor-pointer p-4 hover:bg-gray-50 transition-colors"
                  onClick={() => toggleQuestionExpand(question.questionId)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
                        {index + 1}
                      </span>
                      <h3 className="font-semibold">{question.question}</h3>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-600">
                      <span className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded">
                        <Tag className="w-3 h-3" />
                        {question.category}
                      </span>
                      <span className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded">
                        <TrendingUp className="w-3 h-3" />
                        {(question.confidenceScore * 100).toFixed(0)}%
                      </span>
                      <span className={`px-2 py-0.5 rounded ${question.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                          question.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                        }`}>
                        {question.sentiment}
                      </span>
                    </div>
                  </div>
                  <button className="text-blue-600 hover:text-blue-800 p-2">
                    {expandedQuestions.has(question.questionId) ? (
                      <ChevronLeft className="w-5 h-5 rotate-90" />
                    ) : (
                      <ChevronLeft className="w-5 h-5 -rotate-90" />
                    )}
                  </button>
                </div>

                {expandedQuestions.has(question.questionId) && (
                  <div className="border-t bg-gray-50 p-4 space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2 text-gray-700">Resumen del Análisis</h4>
                      <p className="text-gray-600 bg-white p-3 rounded border">{question.summary}</p>
                    </div>

                    {question.sources[0]?.fullContent && (
                      <div>
                        <h4 className="font-semibold mb-2 flex items-center gap-2 text-gray-700">
                          <FileText className="w-4 h-4" />
                          Respuesta Completa del LLM ({question.sources[0].domain})
                        </h4>
                        <div className="bg-white p-4 rounded border max-h-96 overflow-y-auto">
                          <pre className="whitespace-pre-wrap text-sm font-mono text-gray-700">
                            {question.sources[0].fullContent}
                          </pre>
                        </div>
                      </div>
                    )}

                    {question.brandMentions && question.brandMentions.filter(b => b.mentioned).length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-gray-700">Marcas Mencionadas</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {question.brandMentions.filter(b => b.mentioned).map(brand => (
                            <div key={brand.brand} className="p-3 bg-yellow-50 rounded border border-yellow-200">
                              <div className="font-medium text-yellow-800">{brand.brand}</div>
                              <div className="text-sm text-yellow-700">
                                {brand.frequency} mención/es - {brand.context}
                              </div>
                              {brand.evidence && brand.evidence.length > 0 && (
                                <div className="text-xs text-yellow-600 mt-1 italic">
                                  "{brand.evidence[0].substring(0, 100)}..."
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Vista de lista principal
  return (
    <div className="container mx-auto p-6 space-y-6">
      <Notification />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Historial de Análisis</h1>
          <p className="text-gray-600">
            {filteredAndSortedAnalyses.length} de {analyses.length} análisis
          </p>
        </div>
        <div className="flex gap-2">
          {compareIds.size > 0 && (
            <button
              onClick={startComparison}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
            >
              <GitCompare className="w-4 h-4" />
              Comparar ({compareIds.size})
            </button>
          )}
          <button
            onClick={loadAnalyses}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg shadow space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por marca..."
              value={filterBrand}
              onChange={(e) => { setFilterBrand(e.target.value); setCurrentPage(1); }}
              className="flex-1 px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${showFilters ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
          >
            <Filter className="w-4 h-4" />
            Filtros
          </button>
          {(filterBrand || filterCategory || filterDateFrom || filterDateTo || filterConfidenceMin > 0 || filterConfidenceMax < 100) && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              <X className="w-4 h-4" />
              Limpiar
            </button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
              <select
                value={filterCategory}
                onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">Todas</option>
                {uniqueCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confianza: {filterConfidenceMin}% - {filterConfidenceMax}%
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filterConfidenceMin}
                  onChange={(e) => { setFilterConfidenceMin(Number(e.target.value)); setCurrentPage(1); }}
                  className="flex-1"
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filterConfidenceMax}
                  onChange={(e) => { setFilterConfidenceMax(Number(e.target.value)); setCurrentPage(1); }}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
        )}

        {/* Ordenamiento */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
          <span className="text-sm text-gray-600">Ordenar por:</span>
          <SortButton field="timestamp" label="Fecha" />
          <SortButton field="targetBrand" label="Marca" />
          <SortButton field="overallConfidence" label="Confianza" />
          <SortButton field="questionsCount" label="Preguntas" />
        </div>
      </div>

      {/* Lista de análisis */}
      <div className="space-y-4">
        {paginatedAnalyses.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <div className="text-gray-400 mb-2">
              <Search className="w-12 h-12 mx-auto" />
            </div>
            <div className="text-gray-500">No se encontraron análisis</div>
            {(filterBrand || filterCategory || filterDateFrom || filterDateTo) && (
              <button
                onClick={clearFilters}
                className="mt-2 text-blue-600 hover:text-blue-800"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          paginatedAnalyses.map((analysis) => (
            <div
              key={analysis.id}
              className={`bg-white p-6 rounded-lg shadow hover:shadow-lg transition-all border-l-4 ${compareIds.has(analysis.id) ? 'border-l-purple-500 bg-purple-50' : 'border-l-transparent'
                }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={compareIds.has(analysis.id)}
                    onChange={() => toggleCompareSelection(analysis.id)}
                    className="mt-1.5 w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                    title="Seleccionar para comparar"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-xl font-semibold">{analysis.targetBrand}</h3>
                      <span className={`px-2 py-1 text-xs rounded ${analysis.status === 'completed' ? 'bg-green-100 text-green-800' :
                          analysis.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                        }`}>
                        {analysis.status}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-2 line-clamp-2">{analysis.summary}</p>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(analysis.timestamp).toLocaleString('es-ES')}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        {analysis.questionsCount} preguntas
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" />
                        {(analysis.overallConfidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    {analysis.categories.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {analysis.categories.slice(0, 4).map((cat, i) => (
                          <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded">
                            {cat}
                          </span>
                        ))}
                        {analysis.categories.length > 4 && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                            +{analysis.categories.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    onClick={() => loadAnalysisDetail(analysis.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    <span className="hidden sm:inline">Ver</span>
                  </button>
                  <button
                    onClick={() => generateExcelReport(analysis.id)}
                    disabled={exportingId === analysis.id}
                    className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    title="Exportar Excel"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => generateMarkdownReport(analysis.id)}
                    disabled={exportingId === analysis.id}
                    className="flex items-center gap-1 px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    title="Exportar Markdown"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteAnalysis(analysis.id)}
                    disabled={deletingId === analysis.id}
                    className="flex items-center gap-1 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                    title="Eliminar"
                  >
                    {deletingId === analysis.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">
            Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedAnalyses.length)} de {filteredAndSortedAnalyses.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded transition-colors ${currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-gray-100'
                      }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default History;
