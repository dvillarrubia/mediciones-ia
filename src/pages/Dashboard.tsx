import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  Clock, 
  CheckCircle, 
  Activity,
  Calendar,
  Target,
  Award
} from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import InsightsPanel from '../components/dashboard/InsightsPanel';
import ShareOfVoiceChart from '../components/dashboard/ShareOfVoiceChart';
import Sparkline from '../components/dashboard/Sparkline';
import { useProjectStore } from '../store/projectStore';

interface DashboardMetrics {
  totalAnalyses: number;
  analysesThisMonth: number;
  averageQuestionsPerAnalysis: number;
  mostUsedBrand: string;
  totalBrandsAnalyzed: number;
  averageAnalysisTime: number;
  successRate: number;
  topCategories: Array<{ category: string; count: number }>;
  recentAnalyses: Array<{
    id: string;
    timestamp: string;
    brand: string;
    questionsCount: number;
    status: 'completed' | 'failed';
  }>;
  monthlyTrends: Array<{
    month: string;
    analyses: number;
    avgConfidence: number;
  }>;
  shareOfVoice: Array<{
    brand: string;
    mentions: number;
    percentage: number;
    trend: 'up' | 'down' | 'stable';
    sentiment: {
      positive: number;
      neutral: number;
      negative: number;
    };
  }>;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const { selectedProjectId, getSelectedProject } = useProjectStore();
  const selectedProject = getSelectedProject();

  useEffect(() => {
    loadDashboardMetrics();
  }, [period, selectedProjectId]);

  const loadDashboardMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      let url = `${API_ENDPOINTS.dashboard}?period=${period}`;
      if (selectedProjectId) {
        url += `&projectId=${selectedProjectId}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setMetrics(data.data);
      } else {
        setError('Error al cargar las metricas del dashboard');
      }
    } catch (err) {
      console.error('Error loading dashboard metrics:', err);
      setError('Error de conexion al cargar las metricas');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-300 rounded w-64 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white p-6 rounded-lg shadow-sm">
                  <div className="h-4 bg-gray-300 rounded w-24 mb-2"></div>
                  <div className="h-8 bg-gray-300 rounded w-16"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error</h2>
            <p className="text-red-600">{error}</p>
            <button
              onClick={loadDashboardMetrics}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const formatTime = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Generar datos de sparklines
  const analysesSparklineData = metrics.monthlyTrends.map(t => t.analyses);
  const confidenceSparklineData = metrics.monthlyTrends.map(t => t.avgConfidence);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1">Métricas y estadísticas del sistema</p>
          </div>
          
          <div className="flex gap-2">
            {(['week', 'month', 'quarter'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Trimestre'}
              </button>
            ))}
          </div>
        </div>

        {/* Panel de Insights Automáticos */}
        <InsightsPanel metrics={metrics} period={period} />

        {/* Métricas principales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Análisis</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.totalAnalyses}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Activity className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            {analysesSparklineData.length > 0 && (
              <Sparkline data={analysesSparklineData} height={32} />
            )}
            <div className="mt-2 flex items-center text-sm">
              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-green-600">{metrics.analysesThisMonth} este período</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-gray-600">Marcas Analizadas</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.totalBrandsAnalyzed}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <Target className="h-6 w-6 text-green-600" />
              </div>
            </div>
            {analysesSparklineData.length > 0 && (
              <Sparkline data={analysesSparklineData} color="#10B981" height={32} />
            )}
            <div className="mt-2 text-sm text-gray-600">
              Más usada: <span className="font-medium">{metrics.mostUsedBrand}</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-gray-600">Tiempo Promedio</p>
                <p className="text-2xl font-bold text-gray-900">{formatTime(metrics.averageAnalysisTime)}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
            {analysesSparklineData.length > 0 && (
              <Sparkline data={analysesSparklineData} color="#F59E0B" height={32} />
            )}
            <div className="mt-2 text-sm text-gray-600">
              {metrics.averageQuestionsPerAnalysis.toFixed(1)} preguntas promedio
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-gray-600">Tasa de Éxito</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.successRate.toFixed(1)}%</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
            {confidenceSparklineData.length > 0 && (
              <Sparkline data={confidenceSparklineData} color="#10B981" height={32} />
            )}
            <div className="mt-2 text-sm text-green-600">
              Análisis completados exitosamente
            </div>
          </div>
        </div>

        {/* Share of Voice */}
        <ShareOfVoiceChart data={metrics.shareOfVoice || []} />

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Tendencias mensuales */}
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Tendencias Mensuales</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={metrics.monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="analyses" 
                  stroke="#3B82F6" 
                  strokeWidth={2}
                  name="Análisis"
                />
                <Line 
                  type="monotone" 
                  dataKey="avgConfidence" 
                  stroke="#10B981" 
                  strokeWidth={2}
                  name="Confianza Promedio"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Top categorías */}
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Categorías Más Utilizadas</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={metrics.topCategories}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ category, count }) => `${category} (${count})`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {metrics.topCategories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Análisis recientes */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Análisis Recientes</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Marca
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Preguntas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {metrics.recentAnalyses.map((analysis) => (
                  <tr key={analysis.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {analysis.id.substring(0, 8)}...
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {analysis.brand}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {analysis.questionsCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        analysis.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {analysis.status === 'completed' ? 'Completado' : 'Fallido'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(analysis.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}