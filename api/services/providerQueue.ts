/**
 * Cola global por proveedor para llamadas a LLMs.
 *
 * Todas las llamadas a OpenAI/Anthropic/Google pasan por la cola de su proveedor.
 * La cola garantiza:
 *   - Un máximo de peticiones en vuelo simultáneas (maxConcurrent).
 *   - Un intervalo mínimo entre dispatches (minIntervalMs) para suavizar picos.
 *   - Reintentos automáticos con backoff exponencial cuando el proveedor
 *     devuelve un rate limit transitorio (429 rate_limit_exceeded), respetando
 *     el header `retry-after` si viene.
 *
 * Los errores fatales (invalid_api_key, insufficient_quota, 401) NO se
 * reintentan: se propagan inmediatamente para que el llamante aborte el job.
 *
 * Es un singleton a nivel de proceso: todos los análisis concurrentes (de
 * distintos usuarios) comparten los mismos límites, evitando que varios jobs
 * en paralelo revienten la cuota del proveedor.
 */

interface QueueOptions {
  maxConcurrent: number;
  minIntervalMs: number;
  maxRetries: number;
}

interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  label: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const parseIntEnv = (value: string | undefined, fallback: number): number => {
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isFatalProviderError = (err: any): boolean => {
  if (!err) return false;
  if (err.isAuthError || err.isQuotaError) return true;
  if (err.status === 401) return true;
  const code = err.code || err.error?.code;
  if (code === 'invalid_api_key' || code === 'insufficient_quota') return true;
  return false;
};

const isRetryableRateLimit = (err: any): boolean => {
  if (!err) return false;
  if (isFatalProviderError(err)) return false;
  if (err.status === 429) return true;
  const code = err.code || err.error?.code;
  if (code === 'rate_limit_exceeded') return true;
  return false;
};

const isTransientNetworkError = (err: any): boolean => {
  if (!err) return false;
  if (err.status && err.status >= 500 && err.status < 600) return true;
  const code = err.code || err.error?.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED';
};

const getRetryAfterMs = (err: any): number => {
  const raw = err?.headers?.['retry-after'] ?? err?.response?.headers?.['retry-after'];
  if (!raw) return 0;
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 1000);
};

export class ProviderQueue {
  private queue: QueueItem<any>[] = [];
  private activeCount = 0;
  private lastDispatchAt = 0;
  private draining = false;
  private readonly name: string;
  private readonly opts: QueueOptions;

  constructor(name: string, opts: QueueOptions) {
    this.name = name;
    this.opts = opts;
    console.log(`🧵 [queue:${name}] maxConcurrent=${opts.maxConcurrent}, minIntervalMs=${opts.minIntervalMs}, maxRetries=${opts.maxRetries}`);
  }

  enqueue<T>(fn: () => Promise<T>, label: string = 'task'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, label });
      if (this.queue.length % 25 === 0 && this.queue.length > 0) {
        console.log(`📋 [queue:${this.name}] depth=${this.queue.length}, inflight=${this.activeCount}`);
      }
      this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0 && this.activeCount < this.opts.maxConcurrent) {
        const now = Date.now();
        const elapsed = now - this.lastDispatchAt;
        if (elapsed < this.opts.minIntervalMs) {
          await sleep(this.opts.minIntervalMs - elapsed);
        }
        const item = this.queue.shift();
        if (!item) break;
        this.lastDispatchAt = Date.now();
        this.activeCount++;
        this.runItem(item);
      }
    } finally {
      this.draining = false;
    }
  }

  private async runItem(item: QueueItem<any>): Promise<void> {
    try {
      const result = await this.runWithRetry(item.fn, item.label);
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.activeCount--;
      this.drain();
    }
  }

  private async runWithRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err: any) {
        if (isFatalProviderError(err)) {
          throw err;
        }
        const retryable = isRetryableRateLimit(err) || isTransientNetworkError(err);
        if (!retryable) throw err;

        attempt++;
        if (attempt > this.opts.maxRetries) {
          console.error(`🛑 [queue:${this.name}] ${label} agotó reintentos (${this.opts.maxRetries}). Propagando error.`);
          throw err;
        }

        const retryAfter = getRetryAfterMs(err);
        const backoff = Math.max(
          retryAfter,
          Math.min(30_000, 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 500))
        );
        const reason = err?.status === 429 ? 'rate_limit' : `http_${err?.status || 'net'}`;
        console.warn(`⏳ [queue:${this.name}] ${label} reintento ${attempt}/${this.opts.maxRetries} en ${backoff}ms (${reason})`);
        await sleep(backoff);
      }
    }
  }

  getStats() {
    return {
      name: this.name,
      depth: this.queue.length,
      inflight: this.activeCount,
      maxConcurrent: this.opts.maxConcurrent,
    };
  }
}

const buildQueue = (name: string, prefix: string, defaults: QueueOptions) =>
  new ProviderQueue(name, {
    maxConcurrent: parseIntEnv(process.env[`${prefix}_MAX_CONCURRENT`], defaults.maxConcurrent),
    minIntervalMs: parseIntEnv(process.env[`${prefix}_MIN_INTERVAL_MS`], defaults.minIntervalMs),
    maxRetries: parseIntEnv(process.env[`${prefix}_MAX_RETRIES`], defaults.maxRetries),
  });

export const providerQueues = {
  openai: buildQueue('openai', 'OPENAI_QUEUE', { maxConcurrent: 5, minIntervalMs: 120, maxRetries: 6 }),
  anthropic: buildQueue('anthropic', 'ANTHROPIC_QUEUE', { maxConcurrent: 3, minIntervalMs: 200, maxRetries: 6 }),
  google: buildQueue('google', 'GOOGLE_QUEUE', { maxConcurrent: 3, minIntervalMs: 200, maxRetries: 6 }),
};

export const getQueueStats = () => ({
  openai: providerQueues.openai.getStats(),
  anthropic: providerQueues.anthropic.getStats(),
  google: providerQueues.google.getStats(),
});
