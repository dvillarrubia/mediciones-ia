/**
 * Dashboard routes - Métricas y estadísticas del sistema
 */
import express, { Request, Response } from 'express';
import { databaseService } from '../services/databaseService.js';

const router = express.Router();

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

/**
 * GET /api/dashboard
 * Obtener métricas del dashboard
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const period = req.query.period as string || 'month';
    const projectId = req.query.projectId as string | undefined;

    // Obtener datos de análisis desde la base de datos (filtrados por proyecto si se especifica)
    const analyses = await databaseService.getAllAnalyses(1000, projectId);

    // Calcular métricas
    const metrics = calculateMetrics(analyses, period);

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error obteniendo métricas del dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

function calculateMetrics(savedAnalyses: any[], period: string): DashboardMetrics {
  // Convertir SavedAnalysis[] a formato compatible
  const analyses = savedAnalyses.map(sa => ({
    id: sa.id,
    timestamp: sa.timestamp,
    configuration: sa.configuration,
    results: sa.results,
    metadata: sa.metadata,
    status: sa.metadata?.status || 'completed',
    questions: sa.results?.questions || []
  }));
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  // Filtrar análisis por período
  let periodStart: Date;
  switch (period) {
    case 'week':
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'quarter':
      periodStart = new Date(currentYear, Math.floor(currentMonth / 3) * 3, 1);
      break;
    default: // month
      periodStart = new Date(currentYear, currentMonth, 1);
  }
  
  const periodAnalyses = analyses.filter(analysis => {
    const analysisDate = new Date(analysis.timestamp);
    return analysisDate >= periodStart;
  });

  // Análisis completados vs fallidos
  const completedAnalyses = analyses.filter(a => a.status !== 'failed');
  const successRate = analyses.length > 0 ? (completedAnalyses.length / analyses.length) * 100 : 100;

  // Marcas más analizadas
  const brandCounts: { [key: string]: number } = {};
  analyses.forEach(analysis => {
    const brand = analysis.configuration?.brand || 'Desconocida';
    brandCounts[brand] = (brandCounts[brand] || 0) + 1;
  });
  
  const mostUsedBrand = Object.keys(brandCounts).length > 0 
    ? Object.keys(brandCounts).reduce((a, b) => brandCounts[a] > brandCounts[b] ? a : b)
    : 'Ninguna';
  
  // Categorías más utilizadas
  const categoryCounts: { [key: string]: number } = {};
  analyses.forEach(analysis => {
    if (analysis.questions) {
      analysis.questions.forEach((q: any) => {
        const category = q.category || 'Sin categoría';
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      });
    }
  });
  
  const topCategories = Object.entries(categoryCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // Tiempo promedio de análisis (usar metadata.duration si está disponible)
  const analysesWithDuration = analyses.filter(a => a.metadata?.duration);
  const averageAnalysisTime = analysesWithDuration.length > 0
    ? analysesWithDuration.reduce((sum, a) => sum + (a.metadata.duration || 0), 0) / analysesWithDuration.length / 60000 // convertir ms a minutos
    : 15 + Math.random() * 30; // fallback

  // Preguntas promedio por análisis
  const totalQuestions = analyses.reduce((sum, analysis) => {
    return sum + (analysis.questions?.length || 0);
  }, 0);
  const averageQuestionsPerAnalysis = analyses.length > 0 ? totalQuestions / analyses.length : 0;

  // Análisis recientes
  const recentAnalyses = analyses
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5)
    .map(analysis => ({
      id: analysis.id,
      timestamp: analysis.timestamp,
      brand: analysis.configuration?.brand || 'Desconocida',
      questionsCount: analysis.questions?.length || 0,
      status: analysis.status === 'failed' ? 'failed' as const : 'completed' as const
    }));
  
  // Tendencias mensuales (últimos 6 meses)
  const monthlyTrends = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date(currentYear, currentMonth - i, 1);
    const monthAnalyses = analyses.filter(analysis => {
      const analysisDate = new Date(analysis.timestamp);
      return analysisDate.getMonth() === date.getMonth() &&
             analysisDate.getFullYear() === date.getFullYear();
    });

    // Calcular confianza promedio real de los análisis del mes
    const avgConfidence = monthAnalyses.length > 0
      ? monthAnalyses.reduce((sum, a) => sum + (a.results?.overallConfidence || 0), 0) / monthAnalyses.length * 100
      : 0;

    monthlyTrends.push({
      month: date.toLocaleDateString('es-ES', { month: 'short' }),
      analyses: monthAnalyses.length,
      avgConfidence: avgConfidence
    });
  }

  // Calcular Share of Voice por marca
  const brandMentions: { [key: string]: { count: number; positive: number; neutral: number; negative: number } } = {};

  periodAnalyses.forEach(analysis => {
    if (analysis.results?.brandSummary) {
      const brandSummary = analysis.results.brandSummary;
      // Combinar targetBrands y competitors en un solo array para procesar
      const allBrands = [
        ...(brandSummary.targetBrands || []),
        ...(brandSummary.competitors || [])
      ];

      allBrands.forEach((brandData: any) => {
        const brandName = brandData.brand;
        if (brandData.mentioned && brandData.frequency > 0) {
          if (!brandMentions[brandName]) {
            brandMentions[brandName] = { count: 0, positive: 0, neutral: 0, negative: 0 };
          }
          brandMentions[brandName].count += brandData.frequency;

          // Contabilizar sentimiento basado en context (SentimentType)
          const sentiment = (brandData.context || brandData.sentiment || 'neutral').toLowerCase();
          if (sentiment.includes('positiv')) {
            brandMentions[brandName].positive++;
          } else if (sentiment.includes('negativ')) {
            brandMentions[brandName].negative++;
          } else {
            brandMentions[brandName].neutral++;
          }
        }
      });
    }
  });

  const totalMentions = Object.values(brandMentions).reduce((sum, b) => sum + b.count, 0);

  const shareOfVoice = Object.entries(brandMentions)
    .map(([brand, data]) => ({
      brand,
      mentions: data.count,
      percentage: totalMentions > 0 ? (data.count / totalMentions) * 100 : 0,
      trend: 'stable' as const, // TODO: Calcular comparando con período anterior
      sentiment: {
        positive: data.positive,
        neutral: data.neutral,
        negative: data.negative
      }
    }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 10); // Top 10 marcas

  return {
    totalAnalyses: analyses.length,
    analysesThisMonth: periodAnalyses.length,
    averageQuestionsPerAnalysis,
    mostUsedBrand,
    totalBrandsAnalyzed: Object.keys(brandCounts).length,
    averageAnalysisTime,
    successRate,
    topCategories,
    recentAnalyses,
    monthlyTrends,
    shareOfVoice
  };
}

export default router;