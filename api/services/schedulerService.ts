/**
 * SchedulerService
 * Dispara informes LLM y AIO de forma recurrente según configuraciones en
 * la tabla scheduled_reports. Arranca con el server y tiquea cada minuto.
 */
import sqlite3 from 'sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  databaseService,
  type ScheduledReport,
  type ScheduledReportFrequency,
} from './databaseService.js';
import { authService } from './authService.js';
import ConfigService from './configService.js';
import OpenAIService from './openaiService.js';

const configService = new ConfigService();
import { aiOverviewService, type AIOverviewConfig } from './aiOverviewService.js';
import { type DataForSEOCredentials } from './dataforseoService.js';

const TICK_MS = 60 * 1000;
const BOOT_DELAY_MS = 5 * 1000;

class SchedulerService {
  private intervalHandle: NodeJS.Timeout | null = null;
  private running = new Set<string>();
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    console.log('⏰ SchedulerService iniciado');

    // Recovery: marcar como error los schedules que quedaron en 'running'
    // (server reiniciado en mitad de una ejecución). Sin esto, la UI muestra
    // spinner eterno y el botón "Ejecutar ahora" queda deshabilitado.
    databaseService.resetStuckRunningSchedules()
      .then(n => {
        if (n > 0) console.log(`⚠️  Scheduler: ${n} ejecuciones interrumpidas marcadas como error`);
      })
      .catch(err => console.error('Scheduler: error en recovery de stuck runs:', err));

    setTimeout(() => {
      this.tick().catch(err => console.error('Scheduler initial tick error:', err));
    }, BOOT_DELAY_MS);

    this.intervalHandle = setInterval(() => {
      this.tick().catch(err => console.error('Scheduler tick error:', err));
    }, TICK_MS);
  }

  stop(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    this.started = false;
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const due = await databaseService.listDueScheduledReports(now);
    if (due.length === 0) return;

    for (const schedule of due) {
      if (this.running.has(schedule.id)) continue;
      this.running.add(schedule.id);
      this.executeScheduled(schedule).finally(() => {
        this.running.delete(schedule.id);
      });
    }
  }

  async triggerNow(id: string, userId: string): Promise<{ ok: boolean; error?: string }> {
    // Reservamos el slot ANTES de cualquier await para evitar que el tick
    // del scheduler levante el mismo schedule en paralelo.
    if (this.running.has(id)) return { ok: false, error: 'Ya hay una ejecución en curso' };
    this.running.add(id);

    let schedule;
    try {
      schedule = await databaseService.getScheduledReport(id, userId);
    } catch (err) {
      this.running.delete(id);
      throw err;
    }
    if (!schedule) {
      this.running.delete(id);
      return { ok: false, error: 'Schedule no encontrado' };
    }
    if (!schedule.enabled) {
      this.running.delete(id);
      return { ok: false, error: 'La automatización está pausada. Actívala antes de ejecutar.' };
    }

    this.executeScheduled(schedule).finally(() => this.running.delete(id));
    return { ok: true };
  }

  private async executeScheduled(schedule: ScheduledReport): Promise<void> {
    const nextRunAt = computeNextRunAt(schedule, Date.now() + 1000);

    try {
      await databaseService.markScheduledReportRunning(schedule.id);

      let analysisId: string | null = null;
      if (schedule.type === 'llm') {
        analysisId = await this.runLlmSchedule(schedule);
      } else if (schedule.type === 'aio') {
        analysisId = await this.runAioSchedule(schedule);
      } else {
        throw new Error(`Tipo de schedule desconocido: ${schedule.type}`);
      }

      await databaseService.recordScheduledReportResult(schedule.id, {
        status: 'success',
        lastAnalysisId: analysisId,
        nextRunAt,
      });
      console.log(`✅ Schedule ${schedule.id} (${schedule.name}) ejecutado OK`);
    } catch (err: any) {
      const rawMessage = err?.message || String(err);
      const friendly = humanizeSchedulerError(rawMessage, schedule.type);
      console.error(`❌ Schedule ${schedule.id} (${schedule.name}) falló: ${rawMessage}`);
      await databaseService.recordScheduledReportResult(schedule.id, {
        status: 'error',
        error: friendly,
        nextRunAt,
      });
    }
  }

  private async runLlmSchedule(schedule: ScheduledReport): Promise<string> {
    if (!schedule.configurationId) {
      throw new Error('LLM schedule sin configurationId');
    }

    const apiKeys = await authService.getApiKeys(schedule.userId);
    if (!apiKeys.openai && !apiKeys.anthropic && !apiKeys.google) {
      throw new Error('El usuario no tiene API Keys de LLM configuradas');
    }

    const config = await configService.getConfiguration('custom', schedule.configurationId, schedule.userId);
    if (!config) {
      throw new Error(`Configuración ${schedule.configurationId} no encontrada`);
    }
    const configAny = config as any;
    if (!configAny.questions || configAny.questions.length === 0) {
      throw new Error('La configuración no tiene preguntas');
    }

    const payload = schedule.payload || {};
    const selectedModel = payload.selectedModel || 'gpt-4o-search-preview';
    const countryCode = payload.countryCode || 'ES';
    const countryName = payload.countryName || 'España';
    const timezone = payload.timezone || 'Europe/Madrid';
    const countryContext = payload.countryContext || 'en España, considerando el mercado español';
    const countryLanguage = payload.countryLanguage || 'Español';

    const service = new OpenAIService(apiKeys);
    const extendedConfiguration = {
      ...configAny,
      selectedModel,
      countryCode,
      countryName,
      timezone,
      countryContext,
      countryLanguage,
    };

    const aiModels = configAny.aiModels;
    const isMultiModel = Array.isArray(aiModels) && aiModels.length > 1;

    const result = isMultiModel
      ? await service.executeMultiModelAnalysis(configAny.questions, extendedConfiguration)
      : await service.executeAnalysisWithConfiguration(configAny.questions, extendedConfiguration);

    // Validar que el análisis produjo resultados útiles. El servicio captura
    // errores críticos (quota/auth) internamente y devuelve questions=[] sin
    // lanzar, por lo que debemos detectarlo aquí y marcar el schedule como error.
    const completedCount = Array.isArray(result.questions) ? result.questions.length : 0;
    if (completedCount === 0) {
      const firstError = Array.isArray(result.errors) && result.errors.length > 0
        ? String(result.errors[0])
        : '';
      throw new Error(firstError || 'El análisis no generó resultados');
    }

    const analysisId = (result as any).analysisId || `analysis_${uuidv4()}`;
    await databaseService.saveAnalysis({
      id: analysisId,
      projectId: schedule.projectId,
      timestamp: new Date().toISOString(),
      configuration: {
        brand: configAny.targetBrand || configAny.name,
        competitors: configAny.competitorBrands || configAny.competitors || [],
        templateId: configAny.templateId || 'custom',
        questionsCount: configAny.questions.length,
      },
      results: result,
      metadata: {
        duration: (result as any).duration,
        modelsUsed: aiModels || ['chatgpt'],
        totalQuestions: configAny.questions.length,
      },
    }, schedule.userId);

    return analysisId;
  }

  private async runAioSchedule(schedule: ScheduledReport): Promise<string> {
    const apiKeys = await authService.getApiKeys(schedule.userId);
    const dataforseoKey = apiKeys['dataforseo'];
    if (!dataforseoKey) {
      throw new Error('El usuario no tiene credenciales de DataForSEO');
    }
    const parts = dataforseoKey.split(':');
    if (parts.length < 2) {
      throw new Error('Formato inválido de credencial DataForSEO (se espera login:password)');
    }
    const credentials: DataForSEOCredentials = {
      login: parts[0],
      password: parts.slice(1).join(':'),
    };

    const payload = schedule.payload || {};
    const { targetDomain, competitors, countryCode, targetAliases, keywordsLimit } = payload as any;
    if (!targetDomain || !Array.isArray(competitors) || competitors.length === 0 || !countryCode) {
      throw new Error('Payload AIO incompleto: requiere targetDomain, competitors y countryCode');
    }

    const cleanDomain = (d: string) => d.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
    const cleanedTarget = cleanDomain(targetDomain);
    const cleanedCompetitors = competitors.map((c: string) => cleanDomain(c)).filter((c: string) => c.length > 0);

    if (!cleanedTarget || cleanedCompetitors.length === 0) {
      throw new Error('Dominios AIO inválidos tras limpieza');
    }

    const config: AIOverviewConfig = {
      targetDomain: cleanedTarget,
      targetAliases: targetAliases || [],
      competitors: cleanedCompetitors,
      countryCode,
      keywordsLimit: keywordsLimit === 0 ? 0 : (keywordsLimit || 1000),
    };

    const result = await aiOverviewService.executeAnalysis(credentials, config);

    const dbPath = path.join(process.cwd(), 'data', 'analysis.db');
    const db = new sqlite3.Database(dbPath);
    const id = uuidv4();
    const timestamp = new Date().toISOString();

    try {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO ai_overview_analyses
            (id, user_id, project_id, timestamp, target_domain, competitors,
             location_code, language_code, country_code, configuration, results,
             cost_usd, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            schedule.userId,
            schedule.projectId,
            timestamp,
            config.targetDomain,
            JSON.stringify(config.competitors),
            result.metadata.location_code,
            result.metadata.language_code,
            countryCode,
            JSON.stringify(config),
            JSON.stringify(result),
            result.metadata.total_cost_usd,
            'completed',
          ],
          (err) => (err ? reject(err) : resolve())
        );
      });
    } finally {
      db.close();
    }

    return id;
  }
}

export const schedulerService = new SchedulerService();

// ==================== MENSAJES DE ERROR AMIGABLES ====================

function detectProvider(msg: string): string | null {
  const m = msg.toLowerCase();
  if (m.includes('openai') || m.includes('gpt-')) return 'OpenAI';
  if (m.includes('anthropic') || m.includes('claude')) return 'Anthropic';
  if (m.includes('google') || m.includes('gemini')) return 'Google AI';
  if (m.includes('dataforseo')) return 'DataForSEO';
  return null;
}

/**
 * Traduce errores técnicos a mensajes claros para el usuario.
 * Cortado a 300 caracteres como máximo para caber en la UI.
 */
export function humanizeSchedulerError(raw: string, _scheduleType: 'llm' | 'aio'): string {
  const msg = raw || '';
  const lower = msg.toLowerCase();
  const provider = detectProvider(msg);
  const providerLabel = provider || 'el proveedor';

  // Cuota agotada (429 / insufficient_quota)
  if (
    lower.includes('quota_exceeded') ||
    lower.includes('insufficient_quota') ||
    lower.includes('exceeded your current quota') ||
    lower.includes(':429') ||
    /\b429\b/.test(lower)
  ) {
    return `Cuota de ${providerLabel} agotada. Revisa tu facturación y créditos en el panel del proveedor, o configura otra API Key en Configuración → API Keys.`;
  }

  // API Key inválida / autenticación
  if (
    lower.includes('invalid_api_key') ||
    lower.includes('incorrect api key') ||
    lower.includes('api key inválida') ||
    lower.includes(':401') ||
    /\b401\b/.test(lower) ||
    lower.includes('unauthorized')
  ) {
    return `API Key de ${providerLabel} inválida o expirada. Actualízala en Configuración → API Keys.`;
  }

  // DataForSEO credenciales
  if (lower.includes('dataforseo')) {
    if (lower.includes('credenciales') || lower.includes('credentials') || lower.includes('authentication')) {
      return 'Credenciales de DataForSEO incorrectas. Revisa login/password en Configuración → API Keys.';
    }
  }

  // Sin API keys configuradas
  if (lower.includes('no tiene api keys') || lower.includes('no tiene credenciales')) {
    return msg; // ya es amigable
  }

  // Sin resultados (caso especial lanzado por el scheduler)
  if (lower.includes('no generó resultados')) {
    return 'El análisis no generó resultados. Posibles causas: cuota de API agotada, API Key inválida o caída del proveedor.';
  }

  // Configuración inexistente
  if (lower.includes('configuración') && lower.includes('no encontrada')) {
    return msg;
  }

  // Timeout / red
  if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('econnrefused') || lower.includes('network')) {
    return `Error de red al contactar con ${providerLabel}. Se reintentará en la próxima ejecución programada.`;
  }

  // Default: truncar
  return msg.length > 280 ? msg.slice(0, 277) + '…' : msg;
}

// ==================== CÁLCULO DE PRÓXIMA EJECUCIÓN ====================

function getTzParts(epochMs: number, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'short',
  });
  const parts = fmt.formatToParts(new Date(epochMs));
  const m: Record<string, string> = {};
  parts.forEach(p => { if (p.type !== 'literal') m[p.type] = p.value; });
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // Intl puede devolver '24' para medianoche en algunas plataformas
  const hourStr = m.hour === '24' ? '00' : m.hour;
  return {
    year: Number(m.year),
    month: Number(m.month),
    day: Number(m.day),
    hour: Number(hourStr),
    minute: Number(m.minute),
    second: Number(m.second),
    weekday: wdMap[m.weekday] ?? 0,
  };
}

function tzDateToEpoch(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  const parts1 = getTzParts(naive, tz);
  const tzNaive1 = Date.UTC(parts1.year, parts1.month - 1, parts1.day, parts1.hour, parts1.minute, parts1.second);
  const offset1 = tzNaive1 - naive;
  const candidate = naive - offset1;
  // Segunda pasada para corregir DST cerca de transiciones
  const parts2 = getTzParts(candidate, tz);
  const tzNaive2 = Date.UTC(parts2.year, parts2.month - 1, parts2.day, parts2.hour, parts2.minute, parts2.second);
  const offset2 = tzNaive2 - candidate;
  return naive - offset2;
}

export function computeNextRunAt(
  schedule: Pick<ScheduledReport, 'frequency' | 'hour' | 'weekday' | 'dayOfMonth' | 'timezone'>,
  fromMs: number
): number {
  const tz = schedule.timezone || 'Europe/Madrid';
  const base = getTzParts(fromMs, tz);
  const freq: ScheduledReportFrequency = schedule.frequency;

  if (freq === 'daily') {
    let candidate = tzDateToEpoch(base.year, base.month, base.day, schedule.hour, 0, 0, tz);
    if (candidate <= fromMs) {
      const shifted = getTzParts(fromMs + 24 * 3600_000, tz);
      candidate = tzDateToEpoch(shifted.year, shifted.month, shifted.day, schedule.hour, 0, 0, tz);
    }
    return candidate;
  }

  if (freq === 'weekly') {
    const targetWd = ((schedule.weekday ?? 1) % 7 + 7) % 7;
    let candidate = tzDateToEpoch(base.year, base.month, base.day, schedule.hour, 0, 0, tz);
    let offsetDays = (targetWd - base.weekday + 7) % 7;
    if (offsetDays === 0 && candidate <= fromMs) offsetDays = 7;
    if (offsetDays > 0) {
      const shifted = getTzParts(fromMs + offsetDays * 24 * 3600_000, tz);
      candidate = tzDateToEpoch(shifted.year, shifted.month, shifted.day, schedule.hour, 0, 0, tz);
    }
    return candidate;
  }

  if (freq === 'monthly') {
    const dom = Math.min(Math.max(schedule.dayOfMonth ?? 1, 1), 28);
    let y = base.year;
    let mo = base.month;
    let candidate = tzDateToEpoch(y, mo, dom, schedule.hour, 0, 0, tz);
    if (candidate <= fromMs) {
      mo += 1;
      if (mo > 12) { mo = 1; y += 1; }
      candidate = tzDateToEpoch(y, mo, dom, schedule.hour, 0, 0, tz);
    }
    return candidate;
  }

  throw new Error(`Frecuencia desconocida: ${freq}`);
}
