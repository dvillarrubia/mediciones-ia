/**
 * Rutas para AI Overview - Share of Voice Analysis
 * Usa DataForSEO Labs API para obtener datos de AI Overview references
 */
import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { authService } from '../services/authService.js';
import { aiOverviewService, type AIOverviewConfig } from '../services/aiOverviewService.js';
import { dataforseoService, COUNTRY_TO_LOCATION_CODE, type DataForSEOCredentials } from '../services/dataforseoService.js';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const router = Router();

// Todas las rutas requieren autenticación
router.use(requireAuth);

// ==================== DATABASE HELPERS ====================

function getDb(): sqlite3.Database {
  const dbPath = path.join(process.cwd(), 'data', 'analysis.db');
  return new sqlite3.Database(dbPath);
}

function ensureTable(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS ai_overview_analyses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT,
        timestamp TEXT NOT NULL,
        target_domain TEXT NOT NULL,
        competitors TEXT NOT NULL,
        location_code INTEGER NOT NULL,
        language_code TEXT NOT NULL,
        country_code TEXT NOT NULL,
        configuration TEXT NOT NULL,
        results TEXT NOT NULL,
        cost_usd REAL,
        status TEXT DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) reject(err);
      else {
        db.run('CREATE INDEX IF NOT EXISTS idx_aio_user_id ON ai_overview_analyses(user_id)', () => {
          db.run('CREATE INDEX IF NOT EXISTS idx_aio_project_id ON ai_overview_analyses(project_id)', () => {
            resolve();
          });
        });
      }
    });
  });
}

// Helper para obtener credenciales DataForSEO del usuario
async function getDataForSEOCredentials(userId: string): Promise<DataForSEOCredentials | null> {
  const apiKeys = await authService.getApiKeys(userId);
  const dataforseoKey = apiKeys['dataforseo'];
  if (!dataforseoKey) return null;

  const parts = dataforseoKey.split(':');
  if (parts.length < 2) return null;

  return {
    login: parts[0],
    password: parts.slice(1).join(':'), // password might contain ':'
  };
}

// ==================== ENDPOINTS ====================

/**
 * POST /api/ai-overview/debug-credentials
 * Debug: ver qué credenciales llegan (TEMPORAL)
 */
router.post('/debug-credentials', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userApiKeys } = req.body;
    const dataforseoKey = userApiKeys?.dataforseo;

    if (!dataforseoKey) {
      res.json({ error: 'No dataforseo key in userApiKeys', keys: Object.keys(userApiKeys || {}) });
      return;
    }

    const parts = dataforseoKey.split(':');
    const login = parts[0];
    const password = parts.slice(1).join(':');

    // Probar la autenticación directamente
    const authString = Buffer.from(`${login}:${password}`).toString('base64');

    const testResponse = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        target: 'example.com',
        location_code: 2840,
        language_code: 'en',
        item_types: ['ai_overview_reference'],
        limit: 1,
      }]),
    });

    const testData = await testResponse.json();

    res.json({
      debug: {
        rawKeyLength: dataforseoKey.length,
        rawKeyPreview: dataforseoKey.substring(0, 5) + '...' + dataforseoKey.substring(dataforseoKey.length - 3),
        login,
        passwordLength: password.length,
        passwordPreview: password.substring(0, 2) + '***',
        authHeaderPreview: `Basic ${authString.substring(0, 10)}...`,
        partsCount: parts.length,
      },
      apiResponse: {
        status_code: testData.status_code,
        status_message: testData.status_message,
      }
    });
  } catch (error: any) {
    res.json({ error: error.message });
  }
});

/**
 * POST /api/ai-overview/estimate
 * Estimar coste antes de ejecutar
 */
router.post('/estimate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { targetDomain, competitors, countryCode, keywordsLimit } = req.body;

    if (!targetDomain || !competitors?.length || !countryCode) {
      res.status(400).json({ error: 'targetDomain, competitors y countryCode son requeridos' });
      return;
    }

    const location = COUNTRY_TO_LOCATION_CODE[countryCode];
    if (!location) {
      res.status(400).json({ error: `País no soportado: ${countryCode}` });
      return;
    }

    const domainCount = 1 + competitors.length; // target + competitors
    const estimate = dataforseoService.estimateCost(domainCount, keywordsLimit || 1000);

    res.json({
      success: true,
      data: {
        ...estimate,
        domainCount,
        keywordsLimit: keywordsLimit || 1000,
        location: location,
        countryCode,
      }
    });
  } catch (error: any) {
    console.error('Error estimando coste:', error);
    res.status(500).json({ error: error.message || 'Error al estimar coste' });
  }
});

/**
 * POST /api/ai-overview/execute
 * Ejecutar análisis de AI Overview
 */
router.post('/execute', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const { targetDomain, targetAliases, competitors, countryCode, projectId, keywordsLimit, userApiKeys } = req.body;

    if (!targetDomain || !competitors?.length || !countryCode) {
      res.status(400).json({ error: 'targetDomain, competitors y countryCode son requeridos' });
      return;
    }

    // Obtener credenciales: primero del body (localStorage), luego de la DB
    let credentials: DataForSEOCredentials | null = null;

    const dataforseoKey = userApiKeys?.dataforseo;
    console.log('[AI Overview] dataforseo key from body:', dataforseoKey ? `"${dataforseoKey.substring(0, 20)}..." (len=${dataforseoKey.length})` : 'NOT PRESENT');
    console.log('[AI Overview] all userApiKeys keys:', Object.keys(userApiKeys || {}));
    if (dataforseoKey) {
      const parts = dataforseoKey.split(':');
      console.log('[AI Overview] parsed login:', parts[0], '| password length:', parts.slice(1).join(':').length);
      if (parts.length >= 2) {
        credentials = { login: parts[0], password: parts.slice(1).join(':') };
      }
    }

    if (!credentials) {
      credentials = await getDataForSEOCredentials(userId);
    }

    if (!credentials) {
      res.status(401).json({
        error: 'Credenciales de DataForSEO no configuradas. Ve a Configuración > API Keys para añadirlas.',
        code: 'DATAFORSEO_CREDENTIALS_MISSING'
      });
      return;
    }

    // Normalizar dominios: quitar protocolo, www, barra final
    const cleanDomain = (d: string) => d.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');

    const cleanedTarget = cleanDomain(targetDomain);
    const cleanedCompetitors = competitors.map((c: string) => cleanDomain(c)).filter((c: string) => c.length > 0);
    console.log('[AI Overview] Cleaned target:', cleanedTarget);
    console.log('[AI Overview] Cleaned competitors:', cleanedCompetitors);

    if (!cleanedTarget || cleanedCompetitors.length === 0) {
      res.status(400).json({ error: `Dominios invalidos despues de limpiar. Target: "${cleanedTarget}", Competitors: ${JSON.stringify(cleanedCompetitors)}` });
      return;
    }

    const config: AIOverviewConfig = {
      targetDomain: cleanedTarget,
      targetAliases: targetAliases || [],
      competitors: cleanedCompetitors,
      countryCode,
      keywordsLimit: keywordsLimit === 0 ? 0 : (keywordsLimit || 1000),
    };

    // Ejecutar análisis
    const result = await aiOverviewService.executeAnalysis(credentials, config);

    // Guardar en DB
    const db = getDb();
    await ensureTable(db);

    const id = uuidv4();
    const timestamp = new Date().toISOString();

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO ai_overview_analyses (id, user_id, project_id, timestamp, target_domain, competitors, location_code, language_code, country_code, configuration, results, cost_usd, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userId,
          projectId || null,
          timestamp,
          config.targetDomain,
          JSON.stringify(config.competitors),
          result.metadata.location_code,
          result.metadata.language_code,
          countryCode,
          JSON.stringify(config),
          JSON.stringify(result),
          result.metadata.total_cost_usd,
          'completed'
        ],
        (err) => {
          db.close();
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({
      success: true,
      data: {
        id,
        timestamp,
        result,
      }
    });
  } catch (error: any) {
    console.error('Error ejecutando AI Overview analysis:', error);

    if (error.message?.includes('DataForSEO')) {
      res.status(502).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message || 'Error al ejecutar análisis' });
    }
  }
});

/**
 * GET /api/ai-overview/history
 * Historial de análisis del usuario
 */
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const projectId = req.query.projectId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;

    const db = getDb();
    await ensureTable(db);

    let query: string;
    let params: any[];

    if (projectId) {
      query = `SELECT id, timestamp, target_domain, competitors, country_code, cost_usd, status,
               JSON_EXTRACT(results, '$.share_of_voice') as share_of_voice_summary,
               JSON_EXTRACT(results, '$.metadata.unique_keywords') as unique_keywords
               FROM ai_overview_analyses WHERE user_id = ? AND project_id = ?
               ORDER BY created_at DESC LIMIT ?`;
      params = [userId, projectId, limit];
    } else {
      query = `SELECT id, timestamp, target_domain, competitors, country_code, cost_usd, status,
               JSON_EXTRACT(results, '$.share_of_voice') as share_of_voice_summary,
               JSON_EXTRACT(results, '$.metadata.unique_keywords') as unique_keywords
               FROM ai_overview_analyses WHERE user_id = ?
               ORDER BY created_at DESC LIMIT ?`;
      params = [userId, limit];
    }

    const rows: any[] = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows as any[]);
      });
    });

    const history = rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      targetDomain: row.target_domain,
      competitors: JSON.parse(row.competitors),
      countryCode: row.country_code,
      costUsd: row.cost_usd,
      status: row.status,
      uniqueKeywords: row.unique_keywords,
      shareOfVoice: row.share_of_voice_summary ? JSON.parse(row.share_of_voice_summary) : null,
    }));

    res.json({ success: true, data: history });
  } catch (error: any) {
    console.error('Error obteniendo historial AI Overview:', error);
    res.status(500).json({ error: error.message || 'Error al obtener historial' });
  }
});

/**
 * GET /api/ai-overview/results/:id
 * Obtener resultado completo de un análisis
 */
router.get('/results/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const db = getDb();
    await ensureTable(db);

    const row: any = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM ai_overview_analyses WHERE id = ? AND user_id = ?',
        [id, userId],
        (err, row) => {
          db.close();
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!row) {
      res.status(404).json({ error: 'Análisis no encontrado' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: row.id,
        timestamp: row.timestamp,
        targetDomain: row.target_domain,
        competitors: JSON.parse(row.competitors),
        countryCode: row.country_code,
        costUsd: row.cost_usd,
        status: row.status,
        configuration: JSON.parse(row.configuration),
        results: JSON.parse(row.results),
      }
    });
  } catch (error: any) {
    console.error('Error obteniendo resultado AI Overview:', error);
    res.status(500).json({ error: error.message || 'Error al obtener resultado' });
  }
});

/**
 * DELETE /api/ai-overview/results/:id
 * Eliminar un análisis
 */
router.delete('/results/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const db = getDb();
    await ensureTable(db);

    await new Promise<void>((resolve, reject) => {
      db.run(
        'DELETE FROM ai_overview_analyses WHERE id = ? AND user_id = ?',
        [id, userId],
        function(err) {
          db.close();
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ success: true, message: 'Análisis eliminado' });
  } catch (error: any) {
    console.error('Error eliminando AI Overview:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar' });
  }
});

/**
 * POST /api/ai-overview/validate-credentials
 * Validar credenciales de DataForSEO
 */
router.post('/validate-credentials', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const credentials = await getDataForSEOCredentials(userId);

    if (!credentials) {
      res.json({ success: true, data: { valid: false, reason: 'No credentials configured' } });
      return;
    }

    const valid = await dataforseoService.validateCredentials(credentials);
    res.json({ success: true, data: { valid } });
  } catch (error: any) {
    console.error('Error validando credenciales DataForSEO:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
