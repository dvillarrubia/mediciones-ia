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
  TrendingDown,
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
  BarChart3,
  Lightbulb,
  Target,
  AlertTriangle,
  Zap,
  Info,
  Settings,
  MessageSquare
} from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

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
  evidence?: string[];
}

interface Insight {
  type: 'positive' | 'negative' | 'opportunity' | 'info';
  title: string;
  description: string;
  icon: any;
}

type SortField = 'timestamp' | 'targetBrand' | 'overallConfidence' | 'questionsCount';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE = 10;

const IntelligenceHub: React.FC = () => {
  // Estado principal
  const [activeTab, setActiveTab] = useState<'list' | 'trends' | 'compare' | 'insights'>('list');
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAnalysisDetail, setSelectedAnalysisDetail] = useState<AnalysisDetail | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  // Filtros
  const [filterBrand, setFilterBrand] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterConfidenceMin, setFilterConfidenceMin] = useState<number>(0);
  const [filterConfidenceMax, setFilterConfidenceMax] = useState<number>(100);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Ordenamiento
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);

  // Selección múltiple
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Comparación
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
      const response = await fetch(API_ENDPOINTS.analysisSaved);
      const data = await response.json();

      if (data.success && data.data) {
        const transformedAnalyses: SavedAnalysis[] = data.data.map((analysis: any) => {
          // La API ya devuelve los datos transformados directamente
          return {
            id: analysis.id,
            timestamp: analysis.timestamp,
            targetBrand: analysis.targetBrand || 'Desconocida',
            configurationName: analysis.configurationName || `Análisis de ${analysis.targetBrand || 'Marca'}`,
            templateUsed: analysis.templateUsed || 'Personalizado',
            status: analysis.status || 'completed',
            categories: analysis.categories || [],
            summary: analysis.summary || `Análisis con ${analysis.questionsCount || 0} preguntas`,
            overallConfidence: (analysis.overallConfidence || 0) * 100,
            modelsUsed: analysis.modelsUsed || ['ChatGPT'],
            questionsCount: analysis.questionsCount || 0
          };
        });

        setAnalyses(transformedAnalyses);
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
      const response = await fetch(`${API_ENDPOINTS.analysisSaved}/${id}`);
      const data = await response.json();

      if (data.success) {
        setSelectedAnalysisDetail(data.data);
        setShowDetailPanel(true);
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
      const response = await fetch(`${API_ENDPOINTS.analysisSaved}/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (data.success) {
        setAnalyses(prev => prev.filter(a => a.id !== id));
        setSelectedIds(prev => {
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

  const deleteBatch = async () => {
    if (selectedIds.size === 0) {
      showNotification('error', 'No hay análisis seleccionados');
      return;
    }

    if (!confirm(`¿Estás seguro de que deseas eliminar ${selectedIds.size} análisis? Esta acción no se puede deshacer.`)) {
      return;
    }

    const deletePromises = Array.from(selectedIds).map(id =>
      fetch(`${API_ENDPOINTS.analysisSaved}/${id}`, { method: 'DELETE' })
    );

    try {
      await Promise.all(deletePromises);
      setAnalyses(prev => prev.filter(a => !selectedIds.has(a.id)));
      setSelectedIds(new Set());
      showNotification('success', 'Análisis eliminados correctamente');
    } catch (error) {
      showNotification('error', 'Error al eliminar algunos análisis');
    }
  };

  const generateMarkdownReport = async (analysisId: string) => {
    try {
      setExportingId(analysisId);
      const response = await fetch(`${API_ENDPOINTS.analysisSaved}/${analysisId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await fetch(API_ENDPOINTS.analysisReportMarkdown, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysisResult: data.data.results,
            configuration: data.data.configuration
          })
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
      const response = await fetch(`${API_ENDPOINTS.analysisSaved}/${analysisId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await fetch(API_ENDPOINTS.analysisReportJSON, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysisResult: data.data.results,
            configuration: data.data.configuration
          })
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
      const response = await fetch(`${API_ENDPOINTS.analysisSaved}/${analysisId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await fetch(API_ENDPOINTS.analysisReportExcel, {
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

  const generateCSVReport = async (analysisId: string) => {
    try {
      setExportingId(analysisId);
      const response = await fetch(`${API_ENDPOINTS.analysisSaved}/${analysisId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await fetch(API_ENDPOINTS.analysisReportTable, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysisResult: data.data.results,
            configuration: data.data.configuration
          })
        });

        const reportData = await reportResponse.json();

        if (reportData.success) {
          const blob = new Blob([reportData.data.content], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = reportData.data.filename;
          a.click();
          window.URL.revokeObjectURL(url);
          showNotification('success', 'Reporte CSV descargado');
        }
      }
    } catch (error) {
      console.error('Error generating CSV report:', error);
      showNotification('error', 'Error al generar CSV');
    } finally {
      setExportingId(null);
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredAndSortedAnalyses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedAnalyses.map(a => a.id)));
    }
  };

  const startComparison = async () => {
    if (selectedIds.size < 2) {
      showNotification('error', 'Selecciona al menos 2 análisis');
      return;
    }

    if (selectedIds.size > 4) {
      showNotification('error', 'Máximo 4 análisis para comparar');
      return;
    }

    try {
      const details: AnalysisDetail[] = [];
      for (const id of selectedIds) {
        const response = await fetch(`${API_ENDPOINTS.analysisSaved}/${id}`);
        const data = await response.json();
        if (data.success) {
          details.push(data.data);
        }
      }
      setCompareAnalyses(details);
      setActiveTab('compare');
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
    setFilterStatus('');
    setCurrentPage(1);
  };

  // Categorías únicas
  const uniqueCategories = useMemo(() => {
    const categories = new Set<string>();
    analyses.forEach(a => a.categories.forEach(c => categories.add(c)));
    return Array.from(categories).sort();
  }, [analyses]);

  // Filtrar y ordenar
  const filteredAndSortedAnalyses = useMemo(() => {
    let result = [...analyses];

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

    if (filterStatus) {
      result = result.filter(a => a.status === filterStatus);
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
      const confidence = a.overallConfidence;
      return confidence >= filterConfidenceMin && confidence <= filterConfidenceMax;
    });

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
  }, [analyses, filterBrand, filterCategory, filterStatus, filterDateFrom, filterDateTo, filterConfidenceMin, filterConfidenceMax, sortField, sortDirection]);

  // Paginación
  const totalPages = Math.ceil(filteredAndSortedAnalyses.length / ITEMS_PER_PAGE);
  const paginatedAnalyses = filteredAndSortedAnalyses.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Datos para tendencias
  const trendsData = useMemo(() => {
    const sortedAnalyses = [...analyses].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return sortedAnalyses.map(analysis => ({
      date: new Date(analysis.timestamp).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }),
      timestamp: analysis.timestamp,
      brand: analysis.targetBrand,
      confidence: analysis.overallConfidence
    }));
  }, [analyses]);

  // Insights AI
  const insights = useMemo((): Insight[] => {
    if (analyses.length === 0) return [];

    const insights: Insight[] = [];

    // Marca con mayor presencia
    const brandCounts = new Map<string, number>();
    analyses.forEach(a => {
      brandCounts.set(a.targetBrand, (brandCounts.get(a.targetBrand) || 0) + 1);
    });
    const topBrand = Array.from(brandCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topBrand) {
      insights.push({
        type: 'positive',
        title: 'Marca Más Analizada',
        description: `${topBrand[0]} cuenta con ${topBrand[1]} análisis realizados, siendo la marca con mayor seguimiento.`,
        icon: Target
      });
    }

    // Confianza promedio
    const avgConfidence = analyses.reduce((sum, a) => sum + a.overallConfidence, 0) / analyses.length;
    if (avgConfidence < 50) {
      insights.push({
        type: 'negative',
        title: 'Confianza Baja Detectada',
        description: `La confianza promedio es de ${avgConfidence.toFixed(1)}%. Considera revisar las fuentes o ajustar las preguntas.`,
        icon: AlertTriangle
      });
    } else if (avgConfidence > 75) {
      insights.push({
        type: 'positive',
        title: 'Alta Confianza General',
        description: `La confianza promedio es de ${avgConfidence.toFixed(1)}%, indicando análisis de alta calidad.`,
        icon: CheckCircle2
      });
    }

    // Tendencia temporal
    if (analyses.length >= 3) {
      const sortedByDate = [...analyses].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      const recent = sortedByDate.slice(-3);
      const older = sortedByDate.slice(0, 3);
      const recentAvg = recent.reduce((sum, a) => sum + a.overallConfidence, 0) / recent.length;
      const olderAvg = older.reduce((sum, a) => sum + a.overallConfidence, 0) / older.length;
      const diff = recentAvg - olderAvg;

      if (diff > 10) {
        insights.push({
          type: 'positive',
          title: 'Mejora en Confianza',
          description: `Los análisis recientes muestran un aumento de ${diff.toFixed(1)}% en confianza.`,
          icon: TrendingUp
        });
      } else if (diff < -10) {
        insights.push({
          type: 'negative',
          title: 'Disminución en Confianza',
          description: `Los análisis recientes muestran una disminución de ${Math.abs(diff).toFixed(1)}% en confianza.`,
          icon: TrendingDown
        });
      }
    }

    // Categorías más frecuentes
    const categoryCounts = new Map<string, number>();
    analyses.forEach(a => {
      a.categories.forEach(c => {
        categoryCounts.set(c, (categoryCounts.get(c) || 0) + 1);
      });
    });
    const topCategory = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topCategory) {
      insights.push({
        type: 'info',
        title: 'Categoría Predominante',
        description: `"${topCategory[0]}" es la categoría más analizada con ${topCategory[1]} menciones.`,
        icon: Info
      });
    }

    // Oportunidad de análisis
    const daysSinceLastAnalysis = analyses.length > 0
      ? Math.floor((Date.now() - new Date(analyses[analyses.length - 1].timestamp).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    if (daysSinceLastAnalysis > 7) {
      insights.push({
        type: 'opportunity',
        title: 'Oportunidad de Actualización',
        description: `Han pasado ${daysSinceLastAnalysis} días desde el último análisis. Considera realizar uno nuevo.`,
        icon: Zap
      });
    }

    return insights;
  }, [analyses]);

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
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Cargando análisis...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Notification />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Centro de Inteligencia</h1>
          <p className="text-gray-600 mt-1">
            {filteredAndSortedAnalyses.length} análisis disponibles
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadAnalyses}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'list'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Lista
              </div>
            </button>
            <button
              onClick={() => setActiveTab('trends')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'trends'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Tendencias
              </div>
            </button>
            <button
              onClick={() => setActiveTab('compare')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'compare'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <GitCompare className="w-4 h-4" />
                Comparar
              </div>
            </button>
            <button
              onClick={() => setActiveTab('insights')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'insights'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                Insights AI
              </div>
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* TAB 1: LISTA */}
          {activeTab === 'list' && (
            <div className="space-y-6">
              {/* Filtros */}
              <div className="bg-gray-50 p-4 rounded-lg space-y-4">
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
                  {(filterBrand || filterCategory || filterStatus || filterDateFrom || filterDateTo || filterConfidenceMin > 0 || filterConfidenceMax < 100) && (
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value="">Todos</option>
                        <option value="completed">Completado</option>
                        <option value="in_progress">En Progreso</option>
                        <option value="failed">Fallido</option>
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
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confianza: {filterConfidenceMin}% - {filterConfidenceMax}%
                      </label>
                      <div className="flex gap-4 items-center">
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

                <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
                  <span className="text-sm text-gray-600">Ordenar por:</span>
                  <SortButton field="timestamp" label="Fecha" />
                  <SortButton field="targetBrand" label="Marca" />
                  <SortButton field="overallConfidence" label="Confianza" />
                  <SortButton field="questionsCount" label="Preguntas" />
                </div>
              </div>

              {/* Acciones de selección */}
              {selectedIds.size > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-900">
                    {selectedIds.size} análisis seleccionados
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={startComparison}
                      disabled={selectedIds.size < 2 || selectedIds.size > 4}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <GitCompare className="w-4 h-4" />
                      Comparar
                    </button>
                    <button
                      onClick={deleteBatch}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Eliminar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de análisis */}
              <div className="space-y-4">
                {paginatedAnalyses.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-lg shadow">
                    <Search className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                    <div className="text-gray-500">No se encontraron análisis</div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === paginatedAnalyses.length && paginatedAnalyses.length > 0}
                        onChange={selectAll}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-600">Seleccionar todos</span>
                    </div>
                    {paginatedAnalyses.map((analysis) => (
                      <div
                        key={analysis.id}
                        className={`bg-white p-6 rounded-lg shadow hover:shadow-lg transition-all border-l-4 ${selectedIds.has(analysis.id) ? 'border-l-blue-500 bg-blue-50' : 'border-l-transparent'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(analysis.id)}
                              onChange={() => toggleSelection(analysis.id)}
                              className="mt-1.5 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2 flex-wrap">
                                <h3 className="text-xl font-semibold">{analysis.targetBrand}</h3>
                                <span className={`px-2 py-1 text-xs rounded ${analysis.status === 'completed' ? 'bg-green-100 text-green-800' :
                                    analysis.status === 'failed' ? 'bg-red-100 text-red-800' :
                                      'bg-yellow-100 text-yellow-800'
                                  }`}>
                                  {analysis.status === 'completed' ? 'Completado' : analysis.status}
                                </span>
                              </div>
                              <p className="text-gray-600 mb-2">{analysis.summary}</p>
                              <div className="flex flex-wrap gap-3 text-sm text-gray-500 mb-2">
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
                                  {analysis.overallConfidence.toFixed(0)}% confianza
                                </span>
                              </div>
                              {analysis.categories.length > 0 && (
                                <div className="flex flex-wrap gap-2">
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
                              Ver
                            </button>
                            <div className="relative group">
                              <button
                                className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                                <button
                                  onClick={() => generateMarkdownReport(analysis.id)}
                                  disabled={exportingId === analysis.id}
                                  className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm disabled:opacity-50"
                                >
                                  Markdown
                                </button>
                                <button
                                  onClick={() => generateJSONReport(analysis.id)}
                                  disabled={exportingId === analysis.id}
                                  className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm disabled:opacity-50"
                                >
                                  JSON
                                </button>
                                <button
                                  onClick={() => generateExcelReport(analysis.id)}
                                  disabled={exportingId === analysis.id}
                                  className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm disabled:opacity-50"
                                >
                                  Excel
                                </button>
                                <button
                                  onClick={() => generateCSVReport(analysis.id)}
                                  disabled={exportingId === analysis.id}
                                  className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm disabled:opacity-50"
                                >
                                  CSV
                                </button>
                              </div>
                            </div>
                            <button
                              onClick={() => deleteAnalysis(analysis.id)}
                              disabled={deletingId === analysis.id}
                              className="flex items-center gap-1 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
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
                    ))}
                  </>
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
          )}

          {/* TAB 2: TENDENCIAS */}
          {activeTab === 'trends' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold mb-4">Evolución de Confianza en el Tiempo</h2>
                {trendsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={trendsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="confidence" stroke="#3b82f6" name="Confianza %" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    No hay datos suficientes para mostrar tendencias
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-xl font-bold mb-4">Análisis por Marca</h2>
                {(() => {
                  const brandData = Array.from(
                    analyses.reduce((map, a) => {
                      const existing = map.get(a.targetBrand) || { brand: a.targetBrand, count: 0, avgConfidence: 0 };
                      existing.count += 1;
                      existing.avgConfidence += a.overallConfidence;
                      map.set(a.targetBrand, existing);
                      return map;
                    }, new Map<string, { brand: string; count: number; avgConfidence: number }>())
                  ).map(([_, data]) => ({
                    brand: data.brand,
                    count: data.count,
                    avgConfidence: data.avgConfidence / data.count
                  }));

                  return brandData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={brandData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="brand" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="count" fill="#3b82f6" name="Cantidad de Análisis" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      No hay datos disponibles
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* TAB 3: COMPARAR */}
          {activeTab === 'compare' && (
            <div className="space-y-6">
              {compareAnalyses.length >= 2 ? (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold">Comparación de {compareAnalyses.length} Análisis</h2>
                    <button
                      onClick={() => { setCompareAnalyses([]); setSelectedIds(new Set()); }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Limpiar comparación
                    </button>
                  </div>

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
                          <td className="px-4 py-3 font-medium">Menciones de Marca</td>
                          {compareAnalyses.map(a => (
                            <td key={a.id} className="px-4 py-3 font-semibold">
                              {a.results.brandSummary.targetBrands.filter(b => b.mentioned).length}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-bold mb-4">Frecuencia de Menciones por Marca</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {compareAnalyses.map(a => (
                        <div key={a.id} className="border rounded-lg p-4">
                          <h4 className="font-semibold mb-3">{a.configuration.brand}</h4>
                          <div className="space-y-2">
                            {a.results.brandSummary.targetBrands
                              .filter(b => b.mentioned)
                              .map(brand => (
                                <div key={brand.brand} className="flex justify-between items-center text-sm">
                                  <span>{brand.brand}</span>
                                  <span className="font-semibold text-blue-600">{brand.frequency}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <GitCompare className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Selecciona análisis para comparar</h3>
                  <p className="text-gray-500 mb-4">
                    Ve a la pestaña "Lista" y selecciona entre 2 y 4 análisis, luego haz clic en "Comparar"
                  </p>
                  <button
                    onClick={() => setActiveTab('list')}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Ir a Lista
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: INSIGHTS AI */}
          {activeTab === 'insights' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold mb-2">Insights Automáticos</h2>
                <p className="text-gray-600 mb-6">
                  Análisis inteligente de patrones y tendencias en tus datos
                </p>
              </div>

              {insights.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {insights.map((insight, index) => {
                    const Icon = insight.icon;
                    const colors = {
                      positive: 'bg-green-50 border-green-200 text-green-900',
                      negative: 'bg-red-50 border-red-200 text-red-900',
                      opportunity: 'bg-yellow-50 border-yellow-200 text-yellow-900',
                      info: 'bg-blue-50 border-blue-200 text-blue-900'
                    };
                    const iconColors = {
                      positive: 'text-green-600',
                      negative: 'text-red-600',
                      opportunity: 'text-yellow-600',
                      info: 'text-blue-600'
                    };

                    return (
                      <div
                        key={index}
                        className={`p-6 rounded-lg border-2 ${colors[insight.type]}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-lg bg-white ${iconColors[insight.type]}`}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold mb-2">{insight.title}</h3>
                            <p className="text-sm opacity-90">{insight.description}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Lightbulb className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No hay suficientes datos para generar insights</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Panel lateral de detalle */}
      {showDetailPanel && selectedAnalysisDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-end">
          <div className="bg-white h-full w-full md:w-3/4 lg:w-2/3 xl:w-3/5 overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-bold">{selectedAnalysisDetail.configuration?.brand || 'Análisis'}</h2>
                <p className="text-sm text-gray-500">
                  {new Date(selectedAnalysisDetail.timestamp).toLocaleString('es-ES')} • ID: {selectedAnalysisDetail.id.slice(0, 20)}...
                </p>
              </div>
              <button
                onClick={() => { setShowDetailPanel(false); setSelectedAnalysisDetail(null); }}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Métricas principales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-blue-50 p-3 rounded-lg text-center">
                  <div className="text-xs text-blue-600 mb-1">Preguntas</div>
                  <div className="text-xl font-bold text-blue-900">
                    {selectedAnalysisDetail.results?.questions?.length || 0}
                  </div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg text-center">
                  <div className="text-xs text-green-600 mb-1">Confianza</div>
                  <div className="text-xl font-bold text-green-900">
                    {((selectedAnalysisDetail.results?.overallConfidence || 0) * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg text-center">
                  <div className="text-xs text-purple-600 mb-1">Fuentes</div>
                  <div className="text-xl font-bold text-purple-900">
                    {selectedAnalysisDetail.results?.totalSources || 0}
                  </div>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg text-center">
                  <div className="text-xs text-orange-600 mb-1">Competidores</div>
                  <div className="text-xl font-bold text-orange-900">
                    {selectedAnalysisDetail.configuration?.competitors?.length || 0}
                  </div>
                </div>
              </div>

              {/* Configuración del análisis */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Configuración
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Marca objetivo:</span>
                    <span className="ml-2 font-medium">{selectedAnalysisDetail.configuration?.brand || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Template:</span>
                    <span className="ml-2 font-medium">{selectedAnalysisDetail.configuration?.templateId || 'custom'}</span>
                  </div>
                  {selectedAnalysisDetail.configuration?.competitors?.length > 0 && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Competidores:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedAnalysisDetail.configuration.competitors.map((comp: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded">{comp}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Preguntas y respuestas */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Preguntas Analizadas ({selectedAnalysisDetail.results?.questions?.length || 0})
                </h3>
                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                  {selectedAnalysisDetail.results?.questions?.map((q: any, idx: number) => (
                    <div key={q.questionId || idx} className="border rounded-lg overflow-hidden">
                      {/* Header de la pregunta */}
                      <div className="bg-gray-100 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded font-medium">
                                Q{idx + 1}
                              </span>
                              <span className="bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded">
                                {q.category || 'Sin categoría'}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                q.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                                q.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {q.sentiment || 'neutral'}
                              </span>
                            </div>
                            <p className="font-medium text-gray-900">{q.question}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-blue-600">
                              {((q.confidenceScore || 0) * 100).toFixed(0)}%
                            </div>
                            <div className="text-xs text-gray-500">confianza</div>
                          </div>
                        </div>
                      </div>

                      {/* Contenido de la pregunta */}
                      <div className="p-3 space-y-3">
                        {/* Resumen */}
                        {q.summary && (
                          <div>
                            <div className="text-xs font-semibold text-gray-500 mb-1">RESUMEN</div>
                            <p className="text-sm text-gray-700">{q.summary}</p>
                          </div>
                        )}

                        {/* Menciones de marca en esta pregunta */}
                        {q.brandMentions && q.brandMentions.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-gray-500 mb-2">MENCIONES DE MARCA</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {q.brandMentions.filter((b: any) => b.mentioned).map((brand: any, bIdx: number) => (
                                <div key={bIdx} className={`p-2 rounded border text-sm ${
                                  brand.detailedSentiment === 'positive' || brand.context === 'positive'
                                    ? 'bg-green-50 border-green-200'
                                    : brand.detailedSentiment === 'negative' || brand.context === 'negative'
                                    ? 'bg-red-50 border-red-200'
                                    : 'bg-gray-50 border-gray-200'
                                }`}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium">{brand.brand}</span>
                                    <span className="text-xs bg-white px-1.5 py-0.5 rounded">
                                      {brand.frequency || 0}x
                                    </span>
                                  </div>
                                  {brand.contextualAnalysis && (
                                    <div className="text-xs text-gray-600">
                                      <span className="capitalize">{brand.contextualAnalysis.competitivePosition || 'N/A'}</span>
                                      {brand.contextualAnalysis.confidence && (
                                        <span className="ml-1">• {(brand.contextualAnalysis.confidence * 100).toFixed(0)}% conf.</span>
                                      )}
                                    </div>
                                  )}
                                  {brand.evidence && brand.evidence.length > 0 && (
                                    <details className="mt-1">
                                      <summary className="text-xs text-blue-600 cursor-pointer hover:underline">
                                        Ver evidencia ({brand.evidence.length})
                                      </summary>
                                      <ul className="mt-1 space-y-1 text-xs text-gray-600 max-h-24 overflow-y-auto">
                                        {brand.evidence.slice(0, 3).map((ev: string, eIdx: number) => (
                                          <li key={eIdx} className="pl-2 border-l-2 border-gray-300">
                                            "{ev.slice(0, 150)}{ev.length > 150 ? '...' : ''}"
                                          </li>
                                        ))}
                                      </ul>
                                    </details>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Análisis multi-modelo */}
                        {q.multiModelAnalysis && q.multiModelAnalysis.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-gray-500 mb-2">RESPUESTAS POR MODELO</div>
                            <div className="space-y-2">
                              {q.multiModelAnalysis.map((model: any, mIdx: number) => (
                                <details key={mIdx} className="border rounded">
                                  <summary className="p-2 bg-gray-50 cursor-pointer hover:bg-gray-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full ${
                                        model.modelPersona === 'chatgpt' ? 'bg-green-500' :
                                        model.modelPersona === 'claude' ? 'bg-orange-500' :
                                        model.modelPersona === 'gemini' ? 'bg-blue-500' :
                                        'bg-gray-500'
                                      }`}></span>
                                      <span className="font-medium text-sm capitalize">{model.modelPersona}</span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                      {((model.confidenceScore || 0) * 100).toFixed(0)}% confianza
                                    </span>
                                  </summary>
                                  <div className="p-3 text-sm text-gray-700 max-h-48 overflow-y-auto">
                                    <p className="whitespace-pre-wrap">{model.response?.slice(0, 1000)}{model.response?.length > 1000 ? '...' : ''}</p>
                                  </div>
                                </details>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Fuentes - Respuestas Generativas Completas */}
                        {q.sources && q.sources.length > 0 && (
                          <div className="border-t pt-3 mt-3">
                            <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-2">
                              <MessageSquare className="w-3 h-3" />
                              RESPUESTAS GENERATIVAS ({q.sources.length})
                            </div>
                            <div className="space-y-2">
                              {q.sources.map((source: any, sIdx: number) => (
                                <details key={sIdx} className="border rounded-lg overflow-hidden">
                                  <summary className="p-3 bg-gradient-to-r from-gray-50 to-gray-100 cursor-pointer hover:from-gray-100 hover:to-gray-150 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full ${
                                        source.domain?.toLowerCase().includes('chatgpt') || source.domain?.toLowerCase().includes('openai') ? 'bg-green-500' :
                                        source.domain?.toLowerCase().includes('claude') || source.domain?.toLowerCase().includes('anthropic') ? 'bg-orange-500' :
                                        source.domain?.toLowerCase().includes('gemini') || source.domain?.toLowerCase().includes('google') ? 'bg-blue-500' :
                                        source.domain?.toLowerCase().includes('perplexity') ? 'bg-purple-500' :
                                        'bg-gray-500'
                                      }`}></span>
                                      <span className="font-medium text-sm text-gray-800">
                                        {source.domain || 'IA Generativa'}
                                      </span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                      {source.snippet ? `${source.snippet.length} caracteres` : 'Ver respuesta'}
                                    </span>
                                  </summary>
                                  <div className="p-4 bg-white">
                                    {/* Título/Pregunta */}
                                    {source.title && (
                                      <div className="mb-3 pb-2 border-b">
                                        <div className="text-xs text-gray-500 mb-1">Pregunta:</div>
                                        <p className="text-sm font-medium text-gray-800">{source.title}</p>
                                      </div>
                                    )}

                                    {/* Respuesta completa */}
                                    <div>
                                      <div className="text-xs text-gray-500 mb-1">Respuesta completa:</div>
                                      <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg max-h-96 overflow-y-auto">
                                        {source.snippet || source.content || 'Sin contenido disponible'}
                                      </div>
                                    </div>

                                    {/* URL si existe */}
                                    {source.url && (
                                      <div className="mt-3 pt-2 border-t">
                                        <div className="text-xs text-gray-500">Fuente:</div>
                                        <a
                                          href={source.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-blue-600 hover:underline break-all"
                                        >
                                          {source.url}
                                        </a>
                                      </div>
                                    )}

                                    {/* Metadata adicional */}
                                    {(source.timestamp || source.model) && (
                                      <div className="mt-2 flex gap-4 text-xs text-gray-400">
                                        {source.model && <span>Modelo: {source.model}</span>}
                                        {source.timestamp && <span>Fecha: {new Date(source.timestamp).toLocaleString()}</span>}
                                      </div>
                                    )}
                                  </div>
                                </details>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resumen de marcas general */}
              {selectedAnalysisDetail.results?.brandSummary && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Resumen de Marcas
                  </h3>
                  <div className="space-y-2">
                    {/* Target brands */}
                    {selectedAnalysisDetail.results.brandSummary.targetBrands?.filter((b: any) => b.mentioned).map((brand: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-blue-900">{brand.brand}</span>
                            <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded">Objetivo</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-blue-700">{brand.frequency} menciones</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              brand.context === 'positive' ? 'bg-green-100 text-green-700' :
                              brand.context === 'negative' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {brand.context || 'neutral'}
                            </span>
                          </div>
                        </div>
                        {brand.contextualAnalysis?.reasoning && (
                          <p className="text-sm text-blue-800">{brand.contextualAnalysis.reasoning}</p>
                        )}
                      </div>
                    ))}
                    {/* Competitors */}
                    {selectedAnalysisDetail.results.brandSummary.competitors?.filter((b: any) => b.mentioned).map((brand: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{brand.brand}</span>
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Competidor</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-gray-600">{brand.frequency} menciones</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              brand.context === 'positive' ? 'bg-green-100 text-green-700' :
                              brand.context === 'negative' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {brand.context || 'neutral'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botones de exportación */}
              <div className="flex gap-2 pt-4 border-t sticky bottom-0 bg-white pb-2">
                <button
                  onClick={() => generateMarkdownReport(selectedAnalysisDetail.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  <Download className="w-4 h-4" />
                  Markdown
                </button>
                <button
                  onClick={() => generateJSONReport(selectedAnalysisDetail.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                >
                  <Download className="w-4 h-4" />
                  JSON
                </button>
                <button
                  onClick={() => generateExcelReport(selectedAnalysisDetail.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-sm"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Excel
                </button>
                <button
                  onClick={() => generateCSVReport(selectedAnalysisDetail.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
                >
                  <Download className="w-4 h-4" />
                  CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntelligenceHub;
