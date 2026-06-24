import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
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
  ChevronDown,
  FileSpreadsheet,
  GitCompare,
  X,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  BarChart3,
  Target,
  AlertTriangle,
  Zap,
  Info,
  Settings,
  MessageSquare,
  Heart,
  Hash,
  Link2,
  Crosshair
} from 'lucide-react';
import { API_ENDPOINTS, apiFetch } from '../config/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import AnalysisResultsViewer from '../components/analysis/AnalysisResultsViewer';
import MetricsDashboard from '../components/intelligence/MetricsDashboard';
import AIOverviewDashboard from '../components/intelligence/AIOverviewDashboard';
import SchedulesDashboard from '../components/intelligence/SchedulesDashboard';
import SentimentDashboard from '../components/intelligence/SentimentDashboard';
import TopicsDashboard from '../components/intelligence/TopicsDashboard';
import CitationsDashboard from '../components/intelligence/CitationsDashboard';
import GapsDashboard from '../components/intelligence/GapsDashboard';
import { applyAliasesToAnalyses } from '../components/intelligence/sharedMetrics';
import { useProjectStore } from '../store/projectStore';

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
    name?: string;
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
  const location = useLocation();
  // Auto-select tab desde ?tab=... (usado por el banner de salud)
  const initialTab = (() => {
    const params = new URLSearchParams(location.search);
    const t = params.get('tab');
    if (t === 'schedules' || t === 'ai-overview' || t === 'metrics' || t === 'sentiment' || t === 'topics' || t === 'citations' || t === 'gaps' || t === 'compare' || t === 'list') {
      return t;
    }
    return 'list';
  })();
  // Estado principal
  const [activeTab, setActiveTab] = useState<'list' | 'compare' | 'metrics' | 'sentiment' | 'topics' | 'citations' | 'gaps' | 'ai-overview' | 'schedules'>(initialTab);
  const [scheduleErrorCount, setScheduleErrorCount] = useState<number>(0);

  useEffect(() => {
    const fetchHealth = () => {
      apiFetch(API_ENDPOINTS.schedulesHealth)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.success) setScheduleErrorCount(d.data.errorCount || 0);
        })
        .catch(() => null);
    };
    fetchHealth();
  }, [activeTab]);
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

  // Datos de tendencias (cargados de todos los análisis)
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [allAnalysesDetails, setAllAnalysesDetails] = useState<AnalysisDetail[]>([]);

  // Estados de UI
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Proyecto seleccionado
  const { selectedProjectId, projects } = useProjectStore();
  // Glosario de marcas del proyecto seleccionado → canonicaliza menciones para todos los dashboards
  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );
  const brandAliases = selectedProject?.brandAliases || [];
  const brandDomain = selectedProject?.brandDomain || '';
  const displayAnalyses = useMemo(
    () => applyAliasesToAnalyses(allAnalysesDetails as any, brandAliases) as any[],
    [allAnalysesDetails, brandAliases]
  );

  useEffect(() => {
    loadAnalyses();
    // Limpiar selecciones al cambiar de proyecto
    setSelectedIds(new Set());
    setSelectedAnalysisDetail(null);
    setShowDetailPanel(false);
    setCompareAnalyses([]);
    setAllAnalysesDetails([]);
  }, [selectedProjectId]);

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
      let url = API_ENDPOINTS.analysisSaved;
      if (selectedProjectId) {
        url += `?projectId=${selectedProjectId}`;
      }
      const response = await apiFetch(url);
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
      const response = await apiFetch(`${API_ENDPOINTS.analysisSaved}/${id}`);
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

  const loadAllAnalysesDetails = async () => {
    if (allAnalysesDetails.length > 0 || trendsLoading) return;

    try {
      setTrendsLoading(true);
      const details: AnalysisDetail[] = [];

      for (const analysis of analyses) {
        try {
          const response = await apiFetch(`${API_ENDPOINTS.analysisSaved}/${analysis.id}`);
          const data = await response.json();
          if (data.success) {
            details.push(data.data);
          }
        } catch (e) {
          console.error(`Error loading analysis ${analysis.id}:`, e);
        }
      }

      setAllAnalysesDetails(details);
    } catch (error) {
      console.error('Error loading all analyses:', error);
      showNotification('error', 'Error al cargar datos de tendencias');
    } finally {
      setTrendsLoading(false);
    }
  };

  // Cargar detalles cuando se cambia a la pestaña de tendencias o insights
  useEffect(() => {
    if ((activeTab === 'metrics' || activeTab === 'sentiment' || activeTab === 'topics' || activeTab === 'citations' || activeTab === 'gaps' || activeTab === 'ai-overview') && analyses.length > 0 && allAnalysesDetails.length === 0) {
      loadAllAnalysesDetails();
    }
  }, [activeTab, analyses]);

  const deleteAnalysis = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este análisis? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      setDeletingId(id);
      const response = await apiFetch(`${API_ENDPOINTS.analysisSaved}/${id}`, {
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
      const response = await apiFetch(`${API_ENDPOINTS.analysisSaved}/${analysisId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await apiFetch(API_ENDPOINTS.analysisReportMarkdown, {
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
      const response = await apiFetch(`${API_ENDPOINTS.analysisSaved}/${analysisId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await apiFetch(API_ENDPOINTS.analysisReportJSON, {
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
      const response = await apiFetch(`${API_ENDPOINTS.analysisSaved}/${analysisId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await apiFetch(API_ENDPOINTS.analysisReportExcel, {
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

  const generatePDFReport = async (analysisId: string) => {
    try {
      setExportingId(analysisId);
      showNotification('success', 'Generando PDF... Esto puede tardar unos segundos');

      const response = await apiFetch(`${API_ENDPOINTS.analysisSaved}/${analysisId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await apiFetch(API_ENDPOINTS.analysisReportPDF, {
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
          a.download = `informe-${analysisId}.pdf`;
          a.click();
          window.URL.revokeObjectURL(url);
          showNotification('success', 'Informe PDF descargado');
        } else {
          throw new Error('Error al generar PDF');
        }
      }
    } catch (error) {
      console.error('Error generating PDF report:', error);
      showNotification('error', 'Error al generar PDF');
    } finally {
      setExportingId(null);
    }
  };

  const generateCSVReport = async (analysisId: string) => {
    try {
      setExportingId(analysisId);
      const response = await apiFetch(`${API_ENDPOINTS.analysisSaved}/${analysisId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await apiFetch(API_ENDPOINTS.analysisReportTable, {
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
        const response = await apiFetch(`${API_ENDPOINTS.analysisSaved}/${id}`);
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
          <nav className="flex -mb-px overflow-x-auto">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === 'list'
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
              onClick={() => setActiveTab('compare')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === 'compare'
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
              onClick={() => setActiveTab('metrics')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === 'metrics'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Métricas
              </div>
            </button>
            <button
              onClick={() => setActiveTab('sentiment')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === 'sentiment'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Sentimiento
              </div>
            </button>
            <button
              onClick={() => setActiveTab('topics')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === 'topics'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Topics
              </div>
            </button>
            <button
              onClick={() => setActiveTab('citations')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === 'citations'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                URLs / Citas
              </div>
            </button>
            <button
              onClick={() => setActiveTab('gaps')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === 'gaps'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Crosshair className="w-4 h-4" />
                GAPS
              </div>
            </button>
            <button
              onClick={() => setActiveTab('ai-overview')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === 'ai-overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                AI Overviews
              </div>
            </button>
            <button
              onClick={() => setActiveTab('schedules')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === 'schedules'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Automatizaciones
                {scheduleErrorCount > 0 && activeTab !== 'schedules' && (
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full min-w-[1.25rem]">
                    {scheduleErrorCount}
                  </span>
                )}
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
                                  onClick={() => generatePDFReport(analysis.id)}
                                  disabled={exportingId === analysis.id}
                                  className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm disabled:opacity-50 font-medium text-red-600 border-b"
                                >
                                  PDF (Informe)
                                </button>
                                <button
                                  onClick={() => generateExcelReport(analysis.id)}
                                  disabled={exportingId === analysis.id}
                                  className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm disabled:opacity-50"
                                >
                                  Excel
                                </button>
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

          {/* TAB 5: MÉTRICAS */}
          {activeTab === 'metrics' && (
            <MetricsDashboard analyses={displayAnalyses} loading={trendsLoading} brandDomain={brandDomain} />
          )}

          {/* TAB: SENTIMIENTO */}
          {activeTab === 'sentiment' && (
            <SentimentDashboard analyses={displayAnalyses} loading={trendsLoading} />
          )}

          {/* TAB: TOPICS */}
          {activeTab === 'topics' && (
            <TopicsDashboard analyses={displayAnalyses} loading={trendsLoading} />
          )}

          {/* TAB: URLs / CITAS */}
          {activeTab === 'citations' && (
            <CitationsDashboard analyses={displayAnalyses} loading={trendsLoading} brandDomain={brandDomain} />
          )}

          {/* TAB: GAPS */}
          {activeTab === 'gaps' && (
            <GapsDashboard analyses={displayAnalyses} loading={trendsLoading} brandDomain={brandDomain} />
          )}

          {/* TAB 6: AI OVERVIEWS */}
          {activeTab === 'ai-overview' && (
            <AIOverviewDashboard projectId={selectedProjectId || undefined} />
          )}

          {/* TAB 7: AUTOMATIZACIONES */}
          {activeTab === 'schedules' && (
            <SchedulesDashboard projectId={selectedProjectId} />
          )}
        </div>
      </div>

      {/* Panel lateral de detalle - Usa AnalysisResultsViewer para consistencia */}
      {showDetailPanel && selectedAnalysisDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-end">
          <div className="bg-white h-full w-full md:w-3/4 lg:w-2/3 xl:w-3/5 overflow-y-auto shadow-2xl">
            {/* Header con botón cerrar */}
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

            {/* Usar AnalysisResultsViewer para mostrar el contenido */}
            <div className="p-4">
              <AnalysisResultsViewer
                analysisResult={selectedAnalysisDetail.results}
                onDownload={async (format: 'pdf' | 'excel') => {
                  if (format === 'pdf') {
                    await generatePDFReport(selectedAnalysisDetail.id);
                  } else {
                    await generateExcelReport(selectedAnalysisDetail.id);
                  }
                }}
                configurationName={selectedAnalysisDetail.configuration?.brand}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntelligenceHub;
