/**
 * Rutas para automatizaciones (scheduled reports) LLM y AIO.
 * Todas protegidas por requireAuth y filtradas por userId.
 */
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  databaseService,
  type ScheduledReportFrequency,
  type ScheduledReportType,
} from '../services/databaseService.js';
import { schedulerService, computeNextRunAt } from '../services/schedulerService.js';

const router = Router();
router.use(requireAuth);

const VALID_TYPES: ScheduledReportType[] = ['llm', 'aio'];
const VALID_FREQUENCIES: ScheduledReportFrequency[] = ['daily', 'weekly', 'monthly'];

interface CreateBody {
  projectId?: string;
  name?: string;
  type?: string;
  configurationId?: string | null;
  payload?: Record<string, any>;
  frequency?: string;
  hour?: number;
  weekday?: number | null;
  dayOfMonth?: number | null;
  timezone?: string;
  enabled?: boolean;
}

function validateScheduleInput(body: CreateBody): string | null {
  if (!body.projectId) return 'projectId es requerido';
  if (!body.name || !body.name.trim()) return 'name es requerido';
  if (!body.type || !VALID_TYPES.includes(body.type as ScheduledReportType)) {
    return `type debe ser uno de: ${VALID_TYPES.join(', ')}`;
  }
  if (!body.frequency || !VALID_FREQUENCIES.includes(body.frequency as ScheduledReportFrequency)) {
    return `frequency debe ser uno de: ${VALID_FREQUENCIES.join(', ')}`;
  }
  if (typeof body.hour !== 'number' || body.hour < 0 || body.hour > 23) {
    return 'hour debe ser un número entre 0 y 23';
  }
  if (body.frequency === 'weekly') {
    if (typeof body.weekday !== 'number' || body.weekday < 0 || body.weekday > 6) {
      return 'weekday (0=Domingo..6=Sábado) es requerido para frequency weekly';
    }
  }
  if (body.frequency === 'monthly') {
    if (typeof body.dayOfMonth !== 'number' || body.dayOfMonth < 1 || body.dayOfMonth > 28) {
      return 'dayOfMonth (1..28) es requerido para frequency monthly';
    }
  }
  if (body.type === 'llm' && !body.configurationId) {
    return 'configurationId es requerido para schedules de tipo LLM';
  }
  return null;
}

/**
 * GET /api/schedules/health
 * Devuelve si el usuario tiene schedules con error sin revisar.
 * Importante: debe estar ANTES de `/:id` para no ser interceptado.
 */
router.get('/health', async (req: Request, res: Response): Promise<void> => {
  try {
    const { count, latest } = await databaseService.countUnacknowledgedScheduleErrors(req.userId!);
    res.json({
      success: true,
      data: {
        hasUnacknowledgedErrors: count > 0,
        errorCount: count,
        latest: latest ? {
          id: latest.id,
          name: latest.name,
          projectId: latest.projectId,
          lastError: latest.lastError,
          lastRunAt: latest.lastRunAt,
        } : null,
      },
    });
  } catch (error: any) {
    console.error('Error obteniendo health de schedules:', error);
    res.status(500).json({ error: 'Error obteniendo estado' });
  }
});

/**
 * POST /api/schedules/errors/acknowledge
 * Marca los errores actuales del usuario como vistos. Silencia el banner
 * hasta que ocurra un nuevo error.
 */
router.post('/errors/acknowledge', async (req: Request, res: Response): Promise<void> => {
  try {
    const affected = await databaseService.acknowledgeScheduleErrors(req.userId!);
    res.json({ success: true, acknowledged: affected });
  } catch (error: any) {
    console.error('Error acknowledging schedule errors:', error);
    res.status(500).json({ error: 'Error acknowledgeando errores' });
  }
});

/**
 * GET /api/schedules?projectId=...
 * Lista los schedules del usuario, opcionalmente filtrados por proyecto.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const schedules = await databaseService.listScheduledReports(userId, projectId);
    res.json({ success: true, data: schedules });
  } catch (error: any) {
    console.error('Error listando schedules:', error);
    res.status(500).json({ error: 'Error listando automatizaciones' });
  }
});

/**
 * GET /api/schedules/:id
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const schedule = await databaseService.getScheduledReport(req.params.id, req.userId!);
    if (!schedule) {
      res.status(404).json({ error: 'Automatización no encontrada' });
      return;
    }
    res.json({ success: true, data: schedule });
  } catch (error: any) {
    console.error('Error obteniendo schedule:', error);
    res.status(500).json({ error: 'Error obteniendo automatización' });
  }
});

/**
 * POST /api/schedules
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const body: CreateBody = req.body || {};
    const validationError = validateScheduleInput(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    // Verificar que el proyecto pertenece al usuario
    const project = await databaseService.getProject(body.projectId!, req.userId!);
    if (!project) {
      res.status(404).json({ error: 'Proyecto no encontrado o sin acceso' });
      return;
    }

    const timezone = body.timezone || 'Europe/Madrid';
    const frequency = body.frequency as ScheduledReportFrequency;
    const enabled = body.enabled ?? true;

    const nextRunAt = computeNextRunAt(
      {
        frequency,
        hour: body.hour!,
        weekday: body.weekday ?? null,
        dayOfMonth: body.dayOfMonth ?? null,
        timezone,
      },
      Date.now()
    );

    const created = await databaseService.createScheduledReport({
      userId: req.userId!,
      projectId: body.projectId!,
      name: body.name!.trim(),
      type: body.type as ScheduledReportType,
      configurationId: body.configurationId ?? null,
      payload: body.payload || {},
      frequency,
      hour: body.hour!,
      weekday: body.weekday ?? null,
      dayOfMonth: body.dayOfMonth ?? null,
      timezone,
      enabled,
      nextRunAt,
    });

    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    console.error('Error creando schedule:', error);
    res.status(500).json({ error: 'Error creando automatización' });
  }
});

/**
 * PATCH /api/schedules/:id
 */
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const existing = await databaseService.getScheduledReport(req.params.id, userId);
    if (!existing) {
      res.status(404).json({ error: 'Automatización no encontrada' });
      return;
    }

    const body = req.body || {};
    const updates: any = {};

    if (body.name !== undefined) {
      if (!String(body.name).trim()) {
        res.status(400).json({ error: 'name no puede estar vacío' });
        return;
      }
      updates.name = String(body.name).trim();
    }
    if (body.payload !== undefined) updates.payload = body.payload;
    if (body.configurationId !== undefined) updates.configurationId = body.configurationId;
    if (body.enabled !== undefined) updates.enabled = !!body.enabled;
    if (body.timezone !== undefined) updates.timezone = String(body.timezone);

    let scheduleChanged = false;
    if (body.frequency !== undefined) {
      if (!VALID_FREQUENCIES.includes(body.frequency)) {
        res.status(400).json({ error: `frequency debe ser uno de: ${VALID_FREQUENCIES.join(', ')}` });
        return;
      }
      updates.frequency = body.frequency;
      scheduleChanged = true;
    }
    if (body.hour !== undefined) {
      if (typeof body.hour !== 'number' || body.hour < 0 || body.hour > 23) {
        res.status(400).json({ error: 'hour debe ser un número entre 0 y 23' });
        return;
      }
      updates.hour = body.hour;
      scheduleChanged = true;
    }
    if (body.weekday !== undefined) { updates.weekday = body.weekday; scheduleChanged = true; }
    if (body.dayOfMonth !== undefined) { updates.dayOfMonth = body.dayOfMonth; scheduleChanged = true; }

    // Si cambió algo que afecta al cron, recalculamos próxima ejecución
    if (scheduleChanged || body.timezone !== undefined) {
      const frequency: ScheduledReportFrequency = updates.frequency ?? existing.frequency;
      const hour: number = updates.hour ?? existing.hour;
      const weekday = updates.weekday !== undefined ? updates.weekday : existing.weekday;
      const dayOfMonth = updates.dayOfMonth !== undefined ? updates.dayOfMonth : existing.dayOfMonth;
      const timezone: string = updates.timezone ?? existing.timezone;

      updates.nextRunAt = computeNextRunAt(
        { frequency, hour, weekday, dayOfMonth, timezone },
        Date.now()
      );
    }

    const updated = await databaseService.updateScheduledReport(req.params.id, userId, updates);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Error actualizando schedule:', error);
    res.status(500).json({ error: 'Error actualizando automatización' });
  }
});

/**
 * DELETE /api/schedules/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const deleted = await databaseService.deleteScheduledReport(req.params.id, req.userId!);
    if (!deleted) {
      res.status(404).json({ error: 'Automatización no encontrada' });
      return;
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error eliminando schedule:', error);
    res.status(500).json({ error: 'Error eliminando automatización' });
  }
});

/**
 * POST /api/schedules/:id/run-now
 * Ejecuta la automatización inmediatamente (en background).
 */
router.post('/:id/run-now', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await schedulerService.triggerNow(req.params.id, req.userId!);
    if (!result.ok) {
      const status = result.error === 'Schedule no encontrado' ? 404 : 409;
      res.status(status).json({ error: result.error });
      return;
    }
    res.json({ success: true, message: 'Ejecución iniciada' });
  } catch (error: any) {
    console.error('Error ejecutando schedule manualmente:', error);
    res.status(500).json({ error: 'Error ejecutando automatización' });
  }
});

export default router;
