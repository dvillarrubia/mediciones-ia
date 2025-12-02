import React, { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Info,
  CheckCircle,
  ArrowRight,
  Lightbulb
} from 'lucide-react';

export interface AutoInsight {
  type: 'positive' | 'warning' | 'alert' | 'info';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  data?: any;
  action?: {
    label: string;
    link: string;
  };
}

interface InsightsPanelProps {
  metrics: {
    totalAnalyses: number;
    analysesThisMonth: number;
    averageQuestionsPerAnalysis: number;
    mostUsedBrand: string;
    totalBrandsAnalyzed: number;
    averageAnalysisTime: number;
    successRate: number;
    topCategories: Array<{ category: string; count: number }>;
    monthlyTrends: Array<{
      month: string;
      analyses: number;
      avgConfidence: number;
    }>;
  };
  period: 'week' | 'month' | 'quarter';
}

export default function InsightsPanel({ metrics, period }: InsightsPanelProps) {
  const insights = useMemo(() => {
    const generatedInsights: AutoInsight[] = [];

    // Insight 1: Tasa de éxito
    if (metrics.successRate >= 95) {
      generatedInsights.push({
        type: 'positive',
        priority: 'high',
        title: 'Excelente rendimiento del sistema',
        description: `Tasa de éxito del ${metrics.successRate.toFixed(1)}% - el sistema está funcionando de manera óptima`,
        data: { successRate: metrics.successRate }
      });
    } else if (metrics.successRate < 80) {
      generatedInsights.push({
        type: 'alert',
        priority: 'high',
        title: 'Tasa de éxito por debajo del objetivo',
        description: `Tasa de éxito del ${metrics.successRate.toFixed(1)}% - considere revisar la configuración o las API keys`,
        data: { successRate: metrics.successRate },
        action: {
          label: 'Ver configuración',
          link: '/configuration'
        }
      });
    }

    // Insight 2: Tendencia de análisis
    if (metrics.monthlyTrends && metrics.monthlyTrends.length >= 2) {
      const current = metrics.monthlyTrends[metrics.monthlyTrends.length - 1];
      const previous = metrics.monthlyTrends[metrics.monthlyTrends.length - 2];
      const change = ((current.analyses - previous.analyses) / previous.analyses) * 100;

      if (change > 20) {
        generatedInsights.push({
          type: 'positive',
          priority: 'medium',
          title: 'Incremento significativo en análisis',
          description: `${change.toFixed(0)}% más análisis vs período anterior (${current.analyses} vs ${previous.analyses})`,
          data: { change, current: current.analyses, previous: previous.analyses }
        });
      } else if (change < -20) {
        generatedInsights.push({
          type: 'warning',
          priority: 'medium',
          title: 'Disminución en actividad',
          description: `${Math.abs(change).toFixed(0)}% menos análisis vs período anterior`,
          data: { change, current: current.analyses, previous: previous.analyses }
        });
      }
    }

    // Insight 3: Confianza promedio
    if (metrics.monthlyTrends && metrics.monthlyTrends.length > 0) {
      const latest = metrics.monthlyTrends[metrics.monthlyTrends.length - 1];

      if (latest.avgConfidence >= 85) {
        generatedInsights.push({
          type: 'positive',
          priority: 'low',
          title: 'Alta confianza en los resultados',
          description: `Confianza promedio de ${latest.avgConfidence.toFixed(1)}% - resultados altamente confiables`,
          data: { avgConfidence: latest.avgConfidence }
        });
      } else if (latest.avgConfidence < 70) {
        generatedInsights.push({
          type: 'warning',
          priority: 'medium',
          title: 'Confianza promedio baja',
          description: `Confianza promedio de ${latest.avgConfidence.toFixed(1)}% - considere revisar las preguntas o configuración`,
          data: { avgConfidence: latest.avgConfidence }
        });
      }
    }

    // Insight 4: Actividad este período
    if (metrics.analysesThisMonth === 0) {
      generatedInsights.push({
        type: 'info',
        priority: 'high',
        title: 'Sin actividad reciente',
        description: `No hay análisis en este ${period === 'week' ? 'semana' : period === 'month' ? 'mes' : 'trimestre'}`,
        action: {
          label: 'Crear análisis',
          link: '/analysis'
        }
      });
    } else if (metrics.analysesThisMonth > 20) {
      generatedInsights.push({
        type: 'positive',
        priority: 'low',
        title: 'Alto volumen de análisis',
        description: `${metrics.analysesThisMonth} análisis completados este período - excelente uso del sistema`,
        data: { count: metrics.analysesThisMonth }
      });
    }

    // Insight 5: Diversidad de marcas
    if (metrics.totalBrandsAnalyzed === 1) {
      generatedInsights.push({
        type: 'info',
        priority: 'low',
        title: 'Análisis concentrado en una marca',
        description: `Solo se ha analizado "${metrics.mostUsedBrand}" - considere analizar competidores`,
        action: {
          label: 'Configurar marcas',
          link: '/configuration'
        }
      });
    } else if (metrics.totalBrandsAnalyzed >= 5) {
      generatedInsights.push({
        type: 'positive',
        priority: 'low',
        title: 'Buen análisis competitivo',
        description: `${metrics.totalBrandsAnalyzed} marcas diferentes analizadas - vista competitiva completa`,
        data: { brands: metrics.totalBrandsAnalyzed }
      });
    }

    // Insight 6: Eficiencia de tiempo
    if (metrics.averageAnalysisTime < 2) {
      generatedInsights.push({
        type: 'positive',
        priority: 'low',
        title: 'Análisis muy eficientes',
        description: `Tiempo promedio de ${Math.round(metrics.averageAnalysisTime)} minutos - excelente rendimiento`,
        data: { time: metrics.averageAnalysisTime }
      });
    } else if (metrics.averageAnalysisTime > 10) {
      generatedInsights.push({
        type: 'warning',
        priority: 'medium',
        title: 'Análisis lentos',
        description: `Tiempo promedio de ${Math.round(metrics.averageAnalysisTime)} minutos - considere optimizar`,
        data: { time: metrics.averageAnalysisTime }
      });
    }

    // Ordenar por prioridad
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return generatedInsights
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, 3); // Mostrar solo los 3 más importantes
  }, [metrics, period]);

  if (insights.length === 0) {
    return null;
  }

  const getInsightIcon = (type: AutoInsight['type']) => {
    switch (type) {
      case 'positive':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'alert':
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const getInsightStyles = (type: AutoInsight['type']) => {
    switch (type) {
      case 'positive':
        return {
          container: 'bg-green-50 border-green-200',
          title: 'text-green-900',
          description: 'text-green-700',
          action: 'text-green-600 hover:text-green-700'
        };
      case 'warning':
        return {
          container: 'bg-yellow-50 border-yellow-200',
          title: 'text-yellow-900',
          description: 'text-yellow-700',
          action: 'text-yellow-600 hover:text-yellow-700'
        };
      case 'alert':
        return {
          container: 'bg-red-50 border-red-200',
          title: 'text-red-900',
          description: 'text-red-700',
          action: 'text-red-600 hover:text-red-700'
        };
      case 'info':
        return {
          container: 'bg-blue-50 border-blue-200',
          title: 'text-blue-900',
          description: 'text-blue-700',
          action: 'text-blue-600 hover:text-blue-700'
        };
    }
  };

  const getPriorityBadge = (priority: AutoInsight['priority']) => {
    switch (priority) {
      case 'high':
        return <span className="text-xs font-semibold px-2 py-1 bg-red-100 text-red-700 rounded-full">Alta</span>;
      case 'medium':
        return <span className="text-xs font-semibold px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full">Media</span>;
      case 'low':
        return <span className="text-xs font-semibold px-2 py-1 bg-gray-100 text-gray-700 rounded-full">Baja</span>;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="h-6 w-6 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">Insights Automáticos</h2>
        <span className="text-sm text-gray-500">
          ({insights.length} {insights.length === 1 ? 'insight' : 'insights'})
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {insights.map((insight, index) => {
          const styles = getInsightStyles(insight.type);

          return (
            <div
              key={index}
              className={`border rounded-lg p-4 ${styles.container}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getInsightIcon(insight.type)}
                  <div className="flex items-center gap-2">
                    {getPriorityBadge(insight.priority)}
                  </div>
                </div>
              </div>

              <h3 className={`font-semibold mb-1 ${styles.title}`}>
                {insight.title}
              </h3>

              <p className={`text-sm mb-3 ${styles.description}`}>
                {insight.description}
              </p>

              {insight.action && (
                <a
                  href={insight.action.link}
                  className={`inline-flex items-center gap-1 text-sm font-medium ${styles.action}`}
                >
                  {insight.action.label}
                  <ArrowRight className="h-4 w-4" />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
