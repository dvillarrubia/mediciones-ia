/**
 * Rutas para gestión de caché
 */
import { Router, Request, Response } from 'express';
import { cacheService } from '../services/cacheService.js';

const router = Router();

/**
 * GET /api/cache/stats
 * Obtiene estadísticas del caché
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await cacheService.getStats();

    res.json({
      success: true,
      data: {
        ...stats,
        hitRateFormatted: `${stats.hitRate}%`,
        cacheSizeFormatted: `${(stats.cacheSize / 1024).toFixed(2)} KB`,
        efficiency: stats.totalHits > 0 ? 'Alta' : stats.totalMisses > 10 ? 'Baja' : 'Media',
        costSavings: {
          estimatedApiCallsSaved: stats.totalHits,
          estimatedCostSaved: `$${(stats.totalHits * 0.002).toFixed(2)}` // Estimación aproximada
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas de caché:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo estadísticas de caché',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

/**
 * GET /api/cache/top
 * Obtiene las entradas más populares del caché
 */
router.get('/top', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const topEntries = await cacheService.getTopEntries(limit);

    res.json({
      success: true,
      data: topEntries.map(entry => ({
        question: entry.question,
        llmModel: entry.llmModel,
        hits: entry.hits,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
        responsePreview: entry.response.substring(0, 200) + '...'
      }))
    });
  } catch (error) {
    console.error('Error obteniendo top entries:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo entradas populares',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

/**
 * POST /api/cache/clean
 * Limpia entradas expiradas del caché
 */
router.post('/clean', async (req: Request, res: Response) => {
  try {
    const deletedCount = await cacheService.cleanExpired();

    res.json({
      success: true,
      data: {
        message: `${deletedCount} entradas expiradas eliminadas`,
        deletedCount
      }
    });
  } catch (error) {
    console.error('Error limpiando caché:', error);
    res.status(500).json({
      success: false,
      error: 'Error limpiando caché',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

/**
 * DELETE /api/cache/invalidate/all
 * Invalida todo el caché
 */
router.delete('/invalidate/all', async (req: Request, res: Response) => {
  try {
    await cacheService.invalidateAll();

    res.json({
      success: true,
      data: {
        message: 'Caché completamente invalidado'
      }
    });
  } catch (error) {
    console.error('Error invalidando caché:', error);
    res.status(500).json({
      success: false,
      error: 'Error invalidando caché',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

/**
 * DELETE /api/cache/invalidate/brand/:brand
 * Invalida caché para una marca específica
 */
router.delete('/invalidate/brand/:brand', async (req: Request, res: Response) => {
  try {
    const { brand } = req.params;
    const deletedCount = await cacheService.invalidateByBrand(brand);

    res.json({
      success: true,
      data: {
        message: `Caché invalidado para marca ${brand}`,
        deletedCount
      }
    });
  } catch (error) {
    console.error('Error invalidando caché por marca:', error);
    res.status(500).json({
      success: false,
      error: 'Error invalidando caché por marca',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

export default router;
