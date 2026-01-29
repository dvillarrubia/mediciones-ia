/**
 * Rutas de administración
 * Panel protegido para gestionar whitelist de usuarios
 */
import { Router, type Request, type Response } from 'express';
import { ADMIN_CREDENTIALS } from '../config/constants.js';
import { adminService } from '../services/adminService.js';

const router = Router();

// Middleware de autenticación admin
const requireAdminAuth = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.status(401).json({ error: 'Autenticación requerida' });
    return;
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const [email, password] = credentials.split(':');

  if (email !== ADMIN_CREDENTIALS.email || password !== ADMIN_CREDENTIALS.password) {
    res.status(401).json({ error: 'Credenciales inválidas' });
    return;
  }

  next();
};

/**
 * Verificar credenciales de admin
 * POST /api/admin/login
 */
router.post('/login', (req: Request, res: Response): void => {
  const { email, password } = req.body;

  if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
    // Generar token básico (Base64 de credenciales)
    const token = Buffer.from(`${email}:${password}`).toString('base64');
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Credenciales inválidas' });
  }
});

/**
 * Obtener configuración de whitelist
 * GET /api/admin/whitelist
 */
router.get('/whitelist', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await adminService.getWhitelistConfig();
    res.json(config);
  } catch (error) {
    console.error('Error obteniendo whitelist:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

/**
 * Añadir email al whitelist
 * POST /api/admin/whitelist/emails
 */
router.post('/whitelist/emails', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email requerido' });
      return;
    }

    await adminService.addAllowedEmail(email);
    res.json({ success: true, message: `Email ${email} añadido al whitelist` });
  } catch (error: any) {
    console.error('Error añadiendo email:', error);
    res.status(500).json({ error: error.message || 'Error al añadir email' });
  }
});

/**
 * Eliminar email del whitelist
 * DELETE /api/admin/whitelist/emails/:email
 */
router.delete('/whitelist/emails/:email', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.params;
    await adminService.removeAllowedEmail(email);
    res.json({ success: true, message: `Email ${email} eliminado del whitelist` });
  } catch (error: any) {
    console.error('Error eliminando email:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar email' });
  }
});

/**
 * Añadir dominio al whitelist
 * POST /api/admin/whitelist/domains
 */
router.post('/whitelist/domains', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { domain } = req.body;

    if (!domain) {
      res.status(400).json({ error: 'Dominio requerido' });
      return;
    }

    await adminService.addAllowedDomain(domain);
    res.json({ success: true, message: `Dominio ${domain} añadido al whitelist` });
  } catch (error: any) {
    console.error('Error añadiendo dominio:', error);
    res.status(500).json({ error: error.message || 'Error al añadir dominio' });
  }
});

/**
 * Eliminar dominio del whitelist
 * DELETE /api/admin/whitelist/domains/:domain
 */
router.delete('/whitelist/domains/:domain', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { domain } = req.params;
    await adminService.removeAllowedDomain(domain);
    res.json({ success: true, message: `Dominio ${domain} eliminado del whitelist` });
  } catch (error: any) {
    console.error('Error eliminando dominio:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar dominio' });
  }
});

/**
 * Actualizar configuración de restricción
 * PUT /api/admin/whitelist/restrict
 */
router.put('/whitelist/restrict', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { enabled } = req.body;
    await adminService.setRestrictionEnabled(enabled);
    res.json({ success: true, restrictionEnabled: enabled });
  } catch (error: any) {
    console.error('Error actualizando restricción:', error);
    res.status(500).json({ error: error.message || 'Error al actualizar' });
  }
});

/**
 * Obtener lista de usuarios registrados
 * GET /api/admin/users
 */
router.get('/users', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await adminService.getAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

/**
 * Eliminar usuario
 * DELETE /api/admin/users/:userId
 */
router.delete('/users/:userId', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    await adminService.deleteUser(userId);
    res.json({ success: true, message: 'Usuario eliminado' });
  } catch (error: any) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar usuario' });
  }
});

// ==================== GESTIÓN DE MODELOS DE IA ====================

/**
 * Obtener todos los modelos de IA
 * GET /api/admin/ai-models
 */
router.get('/ai-models', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const models = await adminService.getAllAIModels();
    res.json({ models });
  } catch (error: any) {
    console.error('Error obteniendo modelos:', error);
    res.status(500).json({ error: error.message || 'Error al obtener modelos' });
  }
});

/**
 * Añadir un nuevo modelo de IA
 * POST /api/admin/ai-models
 */
router.post('/ai-models', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const model = req.body;

    if (!model.id || !model.name || !model.provider) {
      res.status(400).json({ error: 'Campos requeridos: id, name, provider' });
      return;
    }

    await adminService.addAIModel({
      id: model.id,
      name: model.name,
      provider: model.provider,
      description: model.description || '',
      strengths: model.strengths || [],
      contextWindow: model.contextWindow || '',
      pricing: model.pricing || '',
      recommended: model.recommended || false,
      enabled: model.enabled !== false,
      requiresApiKey: model.requiresApiKey || 'OPENAI_API_KEY'
    });

    res.json({ success: true, message: `Modelo ${model.name} añadido` });
  } catch (error: any) {
    console.error('Error añadiendo modelo:', error);
    res.status(500).json({ error: error.message || 'Error al añadir modelo' });
  }
});

/**
 * Actualizar un modelo de IA
 * PUT /api/admin/ai-models/:modelId
 */
router.put('/ai-models/:modelId', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { modelId } = req.params;
    const updates = req.body;

    await adminService.updateAIModel(modelId, updates);
    res.json({ success: true, message: `Modelo ${modelId} actualizado` });
  } catch (error: any) {
    console.error('Error actualizando modelo:', error);
    res.status(500).json({ error: error.message || 'Error al actualizar modelo' });
  }
});

/**
 * Eliminar un modelo de IA
 * DELETE /api/admin/ai-models/:modelId
 */
router.delete('/ai-models/:modelId', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { modelId } = req.params;
    await adminService.deleteAIModel(modelId);
    res.json({ success: true, message: `Modelo ${modelId} eliminado` });
  } catch (error: any) {
    console.error('Error eliminando modelo:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar modelo' });
  }
});

/**
 * Activar/desactivar un modelo de IA
 * PATCH /api/admin/ai-models/:modelId/toggle
 */
router.patch('/ai-models/:modelId/toggle', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { modelId } = req.params;
    const { enabled } = req.body;

    await adminService.toggleAIModel(modelId, enabled);
    res.json({ success: true, enabled });
  } catch (error: any) {
    console.error('Error cambiando estado del modelo:', error);
    res.status(500).json({ error: error.message || 'Error al cambiar estado' });
  }
});

/**
 * Sincronizar modelos desde constants.ts
 * POST /api/admin/ai-models/sync
 */
router.post('/ai-models/sync', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await adminService.syncAIModelsFromConstants();
    res.json({ success: true, ...result, message: `${result.added} modelos nuevos añadidos` });
  } catch (error: any) {
    console.error('Error sincronizando modelos:', error);
    res.status(500).json({ error: error.message || 'Error al sincronizar' });
  }
});

/**
 * Reordenar modelos de IA
 * POST /api/admin/ai-models/reorder
 */
router.post('/ai-models/reorder', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { modelIds } = req.body;

    if (!Array.isArray(modelIds)) {
      res.status(400).json({ error: 'Se requiere un array de IDs' });
      return;
    }

    await adminService.reorderAIModels(modelIds);
    res.json({ success: true, message: 'Orden actualizado' });
  } catch (error: any) {
    console.error('Error reordenando modelos:', error);
    res.status(500).json({ error: error.message || 'Error al reordenar' });
  }
});

export default router;
