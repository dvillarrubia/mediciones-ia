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
  ChevronDown,
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
import AnalysisResultsViewer from '../components/analysis/AnalysisResultsViewer';

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

  // Datos de tendencias (cargados de todos los análisis)
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [allAnalysesDetails, setAllAnalysesDetails] = useState<AnalysisDetail[]>([]);

  // Filtros para Tendencias e Insights
  const [trendsDateFrom, setTrendsDateFrom] = useState<string>('');
  const [trendsDateTo, setTrendsDateTo] = useState<string>('');
  const [trendsSelectedAnalyses, setTrendsSelectedAnalyses] = useState<Set<string>>(new Set());
  const [showTrendsFilters, setShowTrendsFilters] = useState(false);

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

  const loadAllAnalysesDetails = async () => {
    if (allAnalysesDetails.length > 0 || trendsLoading) return;

    try {
      setTrendsLoading(true);
      const details: AnalysisDetail[] = [];

      for (const analysis of analyses) {
        try {
          const response = await fetch(`${API_ENDPOINTS.analysisSaved}/${analysis.id}`);
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
    if ((activeTab === 'trends' || activeTab === 'insights') && analyses.length > 0 && allAnalysesDetails.length === 0) {
      loadAllAnalysesDetails();
    }
  }, [activeTab, analyses]);

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

  const generatePDFReport = async (analysisId: string) => {
    try {
      setExportingId(analysisId);
      showNotification('success', 'Generando PDF... Esto puede tardar unos segundos');

      const response = await fetch(`${API_ENDPOINTS.analysisSaved}/${analysisId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await fetch(API_ENDPOINTS.analysisReportPDF, {
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

  // Análisis filtrados solo por fecha (para mostrar en la lista de selección)
  const analysesFilteredByDate = useMemo(() => {
    let result = [...allAnalysesDetails];

    if (trendsDateFrom) {
      const fromDate = new Date(trendsDateFrom);
      result = result.filter(a => new Date(a.timestamp) >= fromDate);
    }
    if (trendsDateTo) {
      const toDate = new Date(trendsDateTo);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter(a => new Date(a.timestamp) <= toDate);
    }

    return result;
  }, [allAnalysesDetails, trendsDateFrom, trendsDateTo]);

  // Análisis filtrados para Tendencias e Insights (fecha + selección manual)
  const filteredAnalysesForTrends = useMemo(() => {
    let result = analysesFilteredByDate;

    // Filtrar por análisis seleccionados (solo si hay selección específica)
    if (trendsSelectedAnalyses.size > 0) {
      result = result.filter(a => trendsSelectedAnalyses.has(a.id));
    }

    return result;
  }, [analysesFilteredByDate, trendsSelectedAnalyses]);

  // Datos para tendencias - Menciones por marca
  const brandMentionsData = useMemo(() => {
    const brandStats: { [key: string]: { mentions: number; positive: number; neutral: number; negative: number } } = {};

    filteredAnalysesForTrends.forEach(analysis => {
      const questions = analysis.results?.questions || [];
      questions.forEach(q => {
        (q.brandMentions || []).forEach(bm => {
          if (bm.mentioned && bm.frequency > 0) {
            if (!brandStats[bm.brand]) {
              brandStats[bm.brand] = { mentions: 0, positive: 0, neutral: 0, negative: 0 };
            }
            brandStats[bm.brand].mentions += bm.frequency;

            const sentiment = (bm.context || 'neutral').toLowerCase();
            if (sentiment.includes('positiv')) {
              brandStats[bm.brand].positive += bm.frequency;
            } else if (sentiment.includes('negativ')) {
              brandStats[bm.brand].negative += bm.frequency;
            } else {
              brandStats[bm.brand].neutral += bm.frequency;
            }
          }
        });
      });
    });

    return Object.entries(brandStats)
      .map(([brand, stats]) => ({
        brand,
        mentions: stats.mentions,
        positive: stats.positive,
        neutral: stats.neutral,
        negative: stats.negative,
        positivePercent: stats.mentions > 0 ? (stats.positive / stats.mentions) * 100 : 0,
        negativePercent: stats.mentions > 0 ? (stats.negative / stats.mentions) * 100 : 0
      }))
      .sort((a, b) => b.mentions - a.mentions);
  }, [filteredAnalysesForTrends]);

  // Datos para tendencias - Evolución temporal de menciones
  const mentionsOverTimeData = useMemo(() => {
    const dataByDate: { [date: string]: { [brand: string]: number } } = {};
    const allBrands = new Set<string>();

    filteredAnalysesForTrends
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach(analysis => {
        const dateKey = new Date(analysis.timestamp).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });

        if (!dataByDate[dateKey]) {
          dataByDate[dateKey] = {};
        }

        const questions = analysis.results?.questions || [];
        questions.forEach(q => {
          (q.brandMentions || []).forEach(bm => {
            if (bm.mentioned && bm.frequency > 0) {
              allBrands.add(bm.brand);
              dataByDate[dateKey][bm.brand] = (dataByDate[dateKey][bm.brand] || 0) + bm.frequency;
            }
          });
        });
      });

    return {
      data: Object.entries(dataByDate).map(([date, brands]) => ({
        date,
        ...brands
      })),
      brands: Array.from(allBrands)
    };
  }, [filteredAnalysesForTrends]);

  // Datos para tendencias - Evolución del sentimiento por marca
  const sentimentOverTimeData = useMemo(() => {
    const dataByDateBrand: { [key: string]: { positive: number; neutral: number; negative: number; total: number } } = {};

    filteredAnalysesForTrends
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach(analysis => {
        const dateKey = new Date(analysis.timestamp).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });

        const questions = analysis.results?.questions || [];
        questions.forEach(q => {
          (q.brandMentions || []).forEach(bm => {
            if (bm.mentioned && bm.frequency > 0) {
              const key = `${dateKey}|${bm.brand}`;
              if (!dataByDateBrand[key]) {
                dataByDateBrand[key] = { positive: 0, neutral: 0, negative: 0, total: 0 };
              }

              const sentiment = (bm.context || 'neutral').toLowerCase();
              dataByDateBrand[key].total += bm.frequency;
              if (sentiment.includes('positiv')) {
                dataByDateBrand[key].positive += bm.frequency;
              } else if (sentiment.includes('negativ')) {
                dataByDateBrand[key].negative += bm.frequency;
              } else {
                dataByDateBrand[key].neutral += bm.frequency;
              }
            }
          });
        });
      });

    // Agrupar por marca para el gráfico
    const brandSentimentData: { [brand: string]: { date: string; positivePercent: number; negativePercent: number }[] } = {};

    Object.entries(dataByDateBrand).forEach(([key, stats]) => {
      const [date, brand] = key.split('|');
      if (!brandSentimentData[brand]) {
        brandSentimentData[brand] = [];
      }
      brandSentimentData[brand].push({
        date,
        positivePercent: stats.total > 0 ? (stats.positive / stats.total) * 100 : 0,
        negativePercent: stats.total > 0 ? (stats.negative / stats.total) * 100 : 0
      });
    });

    return brandSentimentData;
  }, [filteredAnalysesForTrends]);

  // Insights AI - Análisis inteligente basado en datos reales
  const insights = useMemo((): Insight[] => {
    if (brandMentionsData.length === 0) return [];

    const insights: Insight[] = [];
    const totalMentions = brandMentionsData.reduce((sum, b) => sum + b.mentions, 0);

    // 1. LÍDER DEL MERCADO - Marca con más menciones
    const leader = brandMentionsData[0];
    if (leader) {
      const shareOfVoice = ((leader.mentions / totalMentions) * 100).toFixed(1);
      insights.push({
        type: 'info',
        title: `${leader.brand} lidera el Share of Voice`,
        description: `Con ${leader.mentions} menciones (${shareOfVoice}% del total), ${leader.brand} es la marca más visible en las respuestas de IA generativa. ${leader.positivePercent > 50 ? 'Además, tiene un sentimiento mayoritariamente positivo.' : leader.negativePercent > 30 ? 'Sin embargo, presenta un porcentaje notable de menciones negativas.' : ''}`,
        icon: Target
      });
    }

    // 2. MARCA CON MEJOR SENTIMIENTO
    const bestSentiment = [...brandMentionsData]
      .filter(b => b.mentions >= 5) // Solo marcas con suficientes menciones
      .sort((a, b) => b.positivePercent - a.positivePercent)[0];

    if (bestSentiment && bestSentiment.positivePercent > 50) {
      insights.push({
        type: 'positive',
        title: `${bestSentiment.brand} tiene el mejor sentimiento`,
        description: `${bestSentiment.positivePercent.toFixed(0)}% de las menciones de ${bestSentiment.brand} son positivas (${bestSentiment.positive} de ${bestSentiment.mentions}). Esta marca tiene la mejor percepción en las IAs generativas.`,
        icon: TrendingUp
      });
    }

    // 3. MARCA CON PEOR SENTIMIENTO (ALERTA)
    const worstSentiment = [...brandMentionsData]
      .filter(b => b.mentions >= 5)
      .sort((a, b) => b.negativePercent - a.negativePercent)[0];

    if (worstSentiment && worstSentiment.negativePercent > 20) {
      insights.push({
        type: 'negative',
        title: `Alerta: ${worstSentiment.brand} tiene sentimiento negativo`,
        description: `${worstSentiment.negativePercent.toFixed(0)}% de las menciones de ${worstSentiment.brand} son negativas (${worstSentiment.negative} de ${worstSentiment.mentions}). Requiere atención para mejorar su posicionamiento en IA.`,
        icon: AlertTriangle
      });
    }

    // 4. COMPETIDOR EMERGENTE - Segunda marca más mencionada
    if (brandMentionsData.length >= 2) {
      const second = brandMentionsData[1];
      const gap = leader.mentions - second.mentions;
      const gapPercent = ((gap / leader.mentions) * 100).toFixed(0);

      if (gap < leader.mentions * 0.3) {
        insights.push({
          type: 'opportunity',
          title: `${second.brand} compite de cerca con ${leader.brand}`,
          description: `Solo ${gap} menciones separan a ${second.brand} (${second.mentions}) del líder. La competencia por el Share of Voice está muy reñida.`,
          icon: Zap
        });
      } else {
        insights.push({
          type: 'info',
          title: `${leader.brand} domina sobre ${second.brand}`,
          description: `${leader.brand} tiene ${gapPercent}% más menciones que su competidor más cercano. Existe una brecha significativa en visibilidad.`,
          icon: BarChart3
        });
      }
    }

    // 5. MARCAS CON BAJA VISIBILIDAD
    const lowVisibility = brandMentionsData.filter(b => b.mentions < 10 && b.mentions > 0);
    if (lowVisibility.length > 0) {
      const names = lowVisibility.slice(0, 3).map(b => b.brand).join(', ');
      insights.push({
        type: 'opportunity',
        title: `${lowVisibility.length} marcas con baja visibilidad`,
        description: `${names}${lowVisibility.length > 3 ? ` y ${lowVisibility.length - 3} más` : ''} tienen menos de 10 menciones. Oportunidad para mejorar su posicionamiento en IA generativa.`,
        icon: AlertCircle
      });
    }

    // 6. DISTRIBUCIÓN DE SENTIMIENTO GENERAL
    const totalPositive = brandMentionsData.reduce((sum, b) => sum + b.positive, 0);
    const totalNegative = brandMentionsData.reduce((sum, b) => sum + b.negative, 0);
    const totalNeutral = brandMentionsData.reduce((sum, b) => sum + b.neutral, 0);
    const positivePercent = (totalPositive / totalMentions) * 100;
    const negativePercent = (totalNegative / totalMentions) * 100;

    if (positivePercent > 60) {
      insights.push({
        type: 'positive',
        title: 'Sentimiento general muy positivo',
        description: `El ${positivePercent.toFixed(0)}% de todas las menciones son positivas. Las IAs generativas tienen una percepción favorable del mercado analizado.`,
        icon: CheckCircle2
      });
    } else if (negativePercent > 30) {
      insights.push({
        type: 'negative',
        title: 'Alto nivel de menciones negativas',
        description: `El ${negativePercent.toFixed(0)}% de las menciones son negativas. El sector tiene desafíos de percepción en las IAs generativas.`,
        icon: TrendingDown
      });
    }

    // 7. CONCENTRACIÓN DEL MERCADO
    if (brandMentionsData.length >= 3) {
      const top3Mentions = brandMentionsData.slice(0, 3).reduce((sum, b) => sum + b.mentions, 0);
      const top3Percent = (top3Mentions / totalMentions) * 100;

      if (top3Percent > 80) {
        const top3Names = brandMentionsData.slice(0, 3).map(b => b.brand).join(', ');
        insights.push({
          type: 'info',
          title: 'Mercado muy concentrado',
          description: `${top3Names} acumulan el ${top3Percent.toFixed(0)}% de todas las menciones. El resto de marcas tiene muy poca visibilidad en IA.`,
          icon: Info
        });
      }
    }

    // 8. ANÁLISIS TEMPORAL (si hay datos)
    if (Object.keys(sentimentOverTimeData).length > 0) {
      // Buscar marcas con tendencia positiva o negativa
      Object.entries(sentimentOverTimeData).forEach(([brand, data]) => {
        if (data.length >= 2) {
          const firstHalf = data.slice(0, Math.ceil(data.length / 2));
          const secondHalf = data.slice(Math.ceil(data.length / 2));

          const avgFirst = firstHalf.reduce((sum, d) => sum + d.positivePercent, 0) / firstHalf.length;
          const avgSecond = secondHalf.reduce((sum, d) => sum + d.positivePercent, 0) / secondHalf.length;
          const diff = avgSecond - avgFirst;

          if (diff > 15) {
            insights.push({
              type: 'positive',
              title: `${brand} mejora su sentimiento`,
              description: `El sentimiento positivo de ${brand} ha aumentado ${diff.toFixed(0)}pp en los últimos análisis. Tendencia favorable.`,
              icon: TrendingUp
            });
          } else if (diff < -15) {
            insights.push({
              type: 'negative',
              title: `${brand} empeora su sentimiento`,
              description: `El sentimiento positivo de ${brand} ha caído ${Math.abs(diff).toFixed(0)}pp. Requiere investigación.`,
              icon: TrendingDown
            });
          }
        }
      });
    }

    return insights.slice(0, 8); // Limitar a 8 insights máximo
  }, [brandMentionsData, sentimentOverTimeData]);

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

          {/* TAB 2: TENDENCIAS */}
          {activeTab === 'trends' && (
            <div className="space-y-8">
              {trendsLoading ? (
                <div className="text-center py-12">
                  <RefreshCw className="w-8 h-8 mx-auto text-blue-500 animate-spin mb-4" />
                  <p className="text-gray-600">Cargando datos de tendencias...</p>
                  <p className="text-sm text-gray-400 mt-1">Esto puede tardar unos segundos</p>
                </div>
              ) : allAnalysesDetails.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No hay datos suficientes para mostrar tendencias</p>
                  <p className="text-sm mt-1">Realiza algunos análisis primero</p>
                </div>
              ) : (
                <>
                  {/* FILTROS DE TENDENCIAS */}
                  <div className="bg-white rounded-lg shadow-sm border p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Filter className="w-5 h-5 text-gray-500" />
                        <h3 className="font-semibold text-gray-700">Filtros de Análisis</h3>
                        <span className="text-sm text-gray-500">
                          ({filteredAnalysesForTrends.length} de {allAnalysesDetails.length} análisis)
                        </span>
                      </div>
                      <button
                        onClick={() => setShowTrendsFilters(!showTrendsFilters)}
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        {showTrendsFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
                        <ChevronDown className={`w-4 h-4 transition-transform ${showTrendsFilters ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {/* Filtros rápidos siempre visibles */}
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <input
                          type="date"
                          value={trendsDateFrom}
                          onChange={(e) => setTrendsDateFrom(e.target.value)}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="Desde"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                          type="date"
                          value={trendsDateTo}
                          onChange={(e) => setTrendsDateTo(e.target.value)}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="Hasta"
                        />
                      </div>

                      {(trendsDateFrom || trendsDateTo || trendsSelectedAnalyses.size > 0) && (
                        <button
                          onClick={() => {
                            setTrendsDateFrom('');
                            setTrendsDateTo('');
                            setTrendsSelectedAnalyses(new Set());
                          }}
                          className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
                        >
                          <X className="w-4 h-4" />
                          Limpiar filtros
                        </button>
                      )}
                    </div>

                    {/* Panel expandible con selección de análisis */}
                    {showTrendsFilters && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium text-gray-700">
                            Seleccionar análisis específicos
                            {(trendsDateFrom || trendsDateTo) && (
                              <span className="font-normal text-gray-500 ml-2">
                                ({analysesFilteredByDate.length} en el rango de fechas)
                              </span>
                            )}
                          </h4>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setTrendsSelectedAnalyses(new Set())}
                              className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                              Usar todos
                            </button>
                            <button
                              onClick={() => setTrendsSelectedAnalyses(new Set(['__none__']))}
                              className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                            >
                              Deseleccionar todos
                            </button>
                          </div>
                        </div>
                        {analysesFilteredByDate.length === 0 ? (
                          <div className="text-center py-4 text-gray-500 text-sm">
                            No hay análisis en el rango de fechas seleccionado
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                            {analysesFilteredByDate.map(analysis => (
                              <label
                                key={analysis.id}
                                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                                  trendsSelectedAnalyses.size === 0 || trendsSelectedAnalyses.has(analysis.id)
                                    ? 'bg-blue-50 border-blue-200'
                                    : 'bg-gray-50 border-gray-200 opacity-60'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={trendsSelectedAnalyses.size === 0 || trendsSelectedAnalyses.has(analysis.id)}
                                  onChange={(e) => {
                                    let newSet: Set<string>;
                                    if (trendsSelectedAnalyses.size === 0) {
                                      // Modo "todos": crear set con todos los del rango excepto el deseleccionado
                                      newSet = new Set(analysesFilteredByDate.map(a => a.id));
                                      newSet.delete(analysis.id);
                                    } else {
                                      newSet = new Set(trendsSelectedAnalyses);
                                      newSet.delete('__none__'); // Limpiar marcador especial
                                      if (e.target.checked) {
                                        newSet.add(analysis.id);
                                      } else {
                                        newSet.delete(analysis.id);
                                      }
                                    }
                                    // Si todos están seleccionados, volver a modo "todos" (set vacío)
                                    if (newSet.size === analysesFilteredByDate.length) {
                                      newSet = new Set();
                                    }
                                    // Si no queda ninguno, poner marcador especial
                                    if (newSet.size === 0 && !e.target.checked) {
                                      newSet = new Set(['__none__']);
                                    }
                                    setTrendsSelectedAnalyses(newSet);
                                  }}
                                  className="rounded text-blue-600"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-800 truncate">
                                    {analysis.configuration.name || analysis.configuration.brand}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {analysis.configuration.brand} · {new Date(analysis.timestamp).toLocaleDateString('es-ES')}
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 1. MENCIONES POR MARCA */}
                  <div className="bg-white rounded-lg shadow-sm border p-6">
                    <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                      <Target className="w-5 h-5 text-blue-600" />
                      Menciones por Marca
                    </h2>
                    <p className="text-gray-500 text-sm mb-4">
                      Total de menciones en {filteredAnalysesForTrends.length} análisis
                      {trendsDateFrom || trendsDateTo ? ` (${trendsDateFrom || '...'} - ${trendsDateTo || '...'})` : ''}
                    </p>

                    {brandMentionsData.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={brandMentionsData.slice(0, 10)} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="brand" type="category" width={120} tick={{ fontSize: 12 }} />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="bg-white p-3 rounded-lg shadow-lg border">
                                      <p className="font-bold">{data.brand}</p>
                                      <p className="text-sm">Total: <span className="font-semibold">{data.mentions}</span> menciones</p>
                                      <div className="flex gap-2 mt-1 text-xs">
                                        <span className="text-green-600">+{data.positive} pos</span>
                                        <span className="text-gray-500">{data.neutral} neu</span>
                                        <span className="text-red-600">-{data.negative} neg</span>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar dataKey="mentions" fill="#3b82f6" name="Menciones" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>

                        {/* Tabla detallada */}
                        <div className="mt-6 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-gray-50">
                                <th className="text-left p-3 font-semibold">Marca</th>
                                <th className="text-center p-3 font-semibold">Menciones</th>
                                <th className="text-center p-3 font-semibold text-green-600">Positivo</th>
                                <th className="text-center p-3 font-semibold text-gray-500">Neutral</th>
                                <th className="text-center p-3 font-semibold text-red-600">Negativo</th>
                                <th className="text-left p-3 font-semibold">Sentimiento</th>
                              </tr>
                            </thead>
                            <tbody>
                              {brandMentionsData.map((brand, idx) => (
                                <tr key={brand.brand} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="p-3 font-medium">{brand.brand}</td>
                                  <td className="p-3 text-center font-bold text-blue-600">{brand.mentions}</td>
                                  <td className="p-3 text-center text-green-600">{brand.positive} ({brand.positivePercent.toFixed(0)}%)</td>
                                  <td className="p-3 text-center text-gray-500">{brand.neutral}</td>
                                  <td className="p-3 text-center text-red-600">{brand.negative} ({brand.negativePercent.toFixed(0)}%)</td>
                                  <td className="p-3">
                                    <div className="flex h-2 rounded-full overflow-hidden bg-gray-200 w-32">
                                      <div
                                        className="bg-green-500"
                                        style={{ width: `${brand.positivePercent}%` }}
                                      />
                                      <div
                                        className="bg-gray-400"
                                        style={{ width: `${100 - brand.positivePercent - brand.negativePercent}%` }}
                                      />
                                      <div
                                        className="bg-red-500"
                                        style={{ width: `${brand.negativePercent}%` }}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-gray-500">No hay datos de menciones</div>
                    )}
                  </div>

                  {/* 2. EVOLUCIÓN DE MENCIONES EN EL TIEMPO */}
                  <div className="bg-white rounded-lg shadow-sm border p-6">
                    <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-green-600" />
                      Evolución de Menciones
                    </h2>
                    <p className="text-gray-500 text-sm mb-4">Cómo han evolucionado las menciones de cada marca a lo largo del tiempo</p>

                    {mentionsOverTimeData.data.length > 0 ? (
                      <ResponsiveContainer width="100%" height={350}>
                        <LineChart data={mentionsOverTimeData.data}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          {mentionsOverTimeData.brands.slice(0, 8).map((brand, idx) => {
                            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
                            return (
                              <Line
                                key={brand}
                                type="monotone"
                                dataKey={brand}
                                stroke={colors[idx % colors.length]}
                                strokeWidth={2}
                                dot={{ r: 4 }}
                                connectNulls
                              />
                            );
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-8 text-gray-500">No hay datos temporales suficientes</div>
                    )}
                  </div>

                  {/* 3. EVOLUCIÓN DEL SENTIMIENTO POR MARCA */}
                  <div className="bg-white rounded-lg shadow-sm border p-6">
                    <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-purple-600" />
                      Evolución del Sentimiento por Marca
                    </h2>
                    <p className="text-gray-500 text-sm mb-4">Porcentaje de menciones positivas y negativas por marca a lo largo del tiempo</p>

                    {Object.keys(sentimentOverTimeData).length > 0 ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {Object.entries(sentimentOverTimeData)
                          .filter(([_, data]) => data.length > 0)
                          .slice(0, 6)
                          .map(([brand, data]) => (
                            <div key={brand} className="border rounded-lg p-4">
                              <h3 className="font-semibold mb-3 text-gray-800">{brand}</h3>
                              <ResponsiveContainer width="100%" height={150}>
                                <LineChart data={data}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                                  <Tooltip
                                    formatter={(value: number) => `${value.toFixed(1)}%`}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="positivePercent"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    name="% Positivo"
                                    dot={{ r: 3 }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="negativePercent"
                                    stroke="#ef4444"
                                    strokeWidth={2}
                                    name="% Negativo"
                                    dot={{ r: 3 }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                              <div className="flex justify-center gap-4 mt-2 text-xs">
                                <span className="flex items-center gap-1">
                                  <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                                  Positivo
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                                  Negativo
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">No hay datos de sentimiento suficientes</div>
                    )}
                  </div>

                  {/* Resumen de datos */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-100">
                    <h3 className="font-bold text-gray-800 mb-3">Resumen de Datos</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-blue-600">{filteredAnalysesForTrends.length}</div>
                        <div className="text-sm text-gray-600">Análisis incluidos</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-600">{brandMentionsData.length}</div>
                        <div className="text-sm text-gray-600">Marcas detectadas</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-purple-600">
                          {brandMentionsData.reduce((sum, b) => sum + b.mentions, 0)}
                        </div>
                        <div className="text-sm text-gray-600">Total menciones</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-orange-600">
                          {brandMentionsData.length > 0
                            ? (brandMentionsData.reduce((sum, b) => sum + b.positivePercent, 0) / brandMentionsData.length).toFixed(0)
                            : 0}%
                        </div>
                        <div className="text-sm text-gray-600">Sentimiento positivo promedio</div>
                      </div>
                    </div>
                  </div>
                </>
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

          {/* TAB 4: INSIGHTS AI */}
          {activeTab === 'insights' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Lightbulb className="w-8 h-8" />
                  <h2 className="text-2xl font-bold">Insights Inteligentes</h2>
                </div>
                <p className="text-purple-100">
                  Análisis automático de Share of Voice, sentimiento y tendencias basado en {filteredAnalysesForTrends.length} análisis, {brandMentionsData.length} marcas y {brandMentionsData.reduce((sum, b) => sum + b.mentions, 0)} menciones.
                </p>
              </div>

              {/* FILTROS (compartidos con Tendencias) */}
              {allAnalysesDetails.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Filter className="w-5 h-5 text-gray-500" />
                      <h3 className="font-semibold text-gray-700">Filtros de Análisis</h3>
                      <span className="text-sm text-gray-500">
                        ({filteredAnalysesForTrends.length} de {allAnalysesDetails.length} análisis)
                      </span>
                    </div>
                    <button
                      onClick={() => setShowTrendsFilters(!showTrendsFilters)}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      {showTrendsFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
                      <ChevronDown className={`w-4 h-4 transition-transform ${showTrendsFilters ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Filtros rápidos */}
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        value={trendsDateFrom}
                        onChange={(e) => setTrendsDateFrom(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-gray-400">-</span>
                      <input
                        type="date"
                        value={trendsDateTo}
                        onChange={(e) => setTrendsDateTo(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {(trendsDateFrom || trendsDateTo || trendsSelectedAnalyses.size > 0) && (
                      <button
                        onClick={() => {
                          setTrendsDateFrom('');
                          setTrendsDateTo('');
                          setTrendsSelectedAnalyses(new Set());
                        }}
                        className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
                      >
                        <X className="w-4 h-4" />
                        Limpiar filtros
                      </button>
                    )}
                  </div>

                  {/* Panel expandible */}
                  {showTrendsFilters && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-gray-700">
                          Seleccionar análisis específicos
                          {(trendsDateFrom || trendsDateTo) && (
                            <span className="font-normal text-gray-500 ml-2">
                              ({analysesFilteredByDate.length} en el rango de fechas)
                            </span>
                          )}
                        </h4>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setTrendsSelectedAnalyses(new Set())}
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          >
                            Usar todos
                          </button>
                          <button
                            onClick={() => setTrendsSelectedAnalyses(new Set(['__none__']))}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                          >
                            Deseleccionar todos
                          </button>
                        </div>
                      </div>
                      {analysesFilteredByDate.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 text-sm">
                          No hay análisis en el rango de fechas seleccionado
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                          {analysesFilteredByDate.map(analysis => (
                            <label
                              key={analysis.id}
                              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                                trendsSelectedAnalyses.size === 0 || trendsSelectedAnalyses.has(analysis.id)
                                  ? 'bg-blue-50 border-blue-200'
                                  : 'bg-gray-50 border-gray-200 opacity-60'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={trendsSelectedAnalyses.size === 0 || trendsSelectedAnalyses.has(analysis.id)}
                                onChange={(e) => {
                                  let newSet: Set<string>;
                                  if (trendsSelectedAnalyses.size === 0) {
                                    newSet = new Set(analysesFilteredByDate.map(a => a.id));
                                    newSet.delete(analysis.id);
                                  } else {
                                    newSet = new Set(trendsSelectedAnalyses);
                                    newSet.delete('__none__');
                                    if (e.target.checked) {
                                      newSet.add(analysis.id);
                                    } else {
                                      newSet.delete(analysis.id);
                                    }
                                  }
                                  if (newSet.size === analysesFilteredByDate.length) {
                                    newSet = new Set();
                                  }
                                  if (newSet.size === 0 && !e.target.checked) {
                                    newSet = new Set(['__none__']);
                                  }
                                  setTrendsSelectedAnalyses(newSet);
                                }}
                                className="rounded text-blue-600"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-800 truncate">
                                  {analysis.configuration.name || analysis.configuration.brand}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {analysis.configuration.brand} · {new Date(analysis.timestamp).toLocaleDateString('es-ES')}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Estado de carga */}
              {trendsLoading ? (
                <div className="text-center py-12">
                  <RefreshCw className="w-8 h-8 mx-auto text-purple-500 animate-spin mb-4" />
                  <p className="text-gray-600">Analizando datos para generar insights...</p>
                </div>
              ) : allAnalysesDetails.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg shadow">
                  <Lightbulb className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-700 mb-2">Sin datos para analizar</h3>
                  <p className="text-gray-500 mb-4">
                    Primero visita la pestaña "Tendencias" para cargar los datos de análisis.
                  </p>
                  <button
                    onClick={() => setActiveTab('trends')}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Ir a Tendencias
                  </button>
                </div>
              ) : insights.length > 0 ? (
                <>
                  {/* Resumen rápido */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg shadow p-4 text-center">
                      <div className="text-3xl font-bold text-blue-600">{brandMentionsData.length}</div>
                      <div className="text-sm text-gray-500">Marcas analizadas</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4 text-center">
                      <div className="text-3xl font-bold text-green-600">
                        {brandMentionsData.length > 0 ? brandMentionsData[0].brand : '-'}
                      </div>
                      <div className="text-sm text-gray-500">Líder SOV</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4 text-center">
                      <div className="text-3xl font-bold text-purple-600">
                        {(() => {
                          const best = [...brandMentionsData].filter(b => b.mentions >= 5).sort((a, b) => b.positivePercent - a.positivePercent)[0];
                          return best ? best.brand : '-';
                        })()}
                      </div>
                      <div className="text-sm text-gray-500">Mejor sentimiento</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4 text-center">
                      <div className="text-3xl font-bold text-orange-600">
                        {insights.filter(i => i.type === 'negative' || i.type === 'opportunity').length}
                      </div>
                      <div className="text-sm text-gray-500">Alertas/Oportunidades</div>
                    </div>
                  </div>

                  {/* Insights cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {insights.map((insight, index) => {
                      const Icon = insight.icon;
                      const styles = {
                        positive: {
                          card: 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200',
                          icon: 'bg-green-100 text-green-600',
                          title: 'text-green-900',
                          badge: 'bg-green-100 text-green-700'
                        },
                        negative: {
                          card: 'bg-gradient-to-br from-red-50 to-rose-50 border-red-200',
                          icon: 'bg-red-100 text-red-600',
                          title: 'text-red-900',
                          badge: 'bg-red-100 text-red-700'
                        },
                        opportunity: {
                          card: 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200',
                          icon: 'bg-amber-100 text-amber-600',
                          title: 'text-amber-900',
                          badge: 'bg-amber-100 text-amber-700'
                        },
                        info: {
                          card: 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200',
                          icon: 'bg-blue-100 text-blue-600',
                          title: 'text-blue-900',
                          badge: 'bg-blue-100 text-blue-700'
                        }
                      };

                      const style = styles[insight.type];
                      const badgeText = {
                        positive: 'Fortaleza',
                        negative: 'Alerta',
                        opportunity: 'Oportunidad',
                        info: 'Información'
                      };

                      return (
                        <div
                          key={index}
                          className={`p-5 rounded-xl border-2 ${style.card} transition-all hover:shadow-md`}
                        >
                          <div className="flex items-start gap-4">
                            <div className={`p-3 rounded-xl ${style.icon}`}>
                              <Icon className="w-6 h-6" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
                                  {badgeText[insight.type]}
                                </span>
                              </div>
                              <h3 className={`font-bold text-lg mb-2 ${style.title}`}>{insight.title}</h3>
                              <p className="text-gray-700 text-sm leading-relaxed">{insight.description}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Leyenda */}
                  <div className="bg-white rounded-lg shadow p-4">
                    <h4 className="font-medium text-gray-700 mb-3">Leyenda de Insights</h4>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-green-500"></span>
                        <span className="text-gray-600">Fortaleza - Aspectos positivos a mantener</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-red-500"></span>
                        <span className="text-gray-600">Alerta - Requiere atención inmediata</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                        <span className="text-gray-600">Oportunidad - Área de mejora potencial</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                        <span className="text-gray-600">Información - Dato relevante del mercado</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 bg-white rounded-lg shadow">
                  <Lightbulb className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-700 mb-2">No hay insights disponibles</h3>
                  <p className="text-gray-500">
                    Necesitas más datos de análisis para generar insights útiles.
                  </p>
                </div>
              )}
            </div>
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
