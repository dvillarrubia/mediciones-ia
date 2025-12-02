/**
 * Servicio de caché para respuestas de LLM usando SQLite
 * Reduce costos de API y mejora velocidad de respuesta
 */
import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import path from 'path';
import crypto from 'crypto';

export interface CacheEntry {
  key: string;
  question: string;
  response: string;
  llmModel: string;
  configuration: string; // JSON string
  createdAt: string;
  expiresAt: string;
  hits: number;
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
  cacheSize: number; // bytes
  oldestEntry: string;
  newestEntry: string;
}

class CacheService {
  private db: Database | null = null;
  private dbPath: string;
  private stats = {
    hits: 0,
    misses: 0
  };

  // TTL por defecto: 7 días
  private DEFAULT_TTL_DAYS = 7;

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'analysis.db');
    this.initializeCache();
  }

  private async initializeCache(): Promise<void> {
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('❌ Error al abrir la base de datos de caché:', err);
        return;
      }
      console.log('✅ Servicio de caché SQLite inicializado');
      this.createCacheTables();
    });
  }

  private createCacheTables(): void {
    const createCacheTableQuery = `
      CREATE TABLE IF NOT EXISTS llm_cache (
        key TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        response TEXT NOT NULL,
        llm_model TEXT NOT NULL,
        configuration TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        hits INTEGER DEFAULT 0
      )
    `;

    const createIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_llm_cache_expires
      ON llm_cache(expires_at)
    `;

    const createStatsTableQuery = `
      CREATE TABLE IF NOT EXISTS cache_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        details TEXT
      )
    `;

    this.db?.run(createCacheTableQuery, (err) => {
      if (err) {
        console.error('❌ Error al crear tabla de caché:', err);
      } else {
        console.log('✅ Tabla llm_cache creada/verificada');
      }
    });

    this.db?.run(createIndexQuery, (err) => {
      if (err) {
        console.error('❌ Error al crear índice:', err);
      }
    });

    this.db?.run(createStatsTableQuery, (err) => {
      if (err) {
        console.error('❌ Error al crear tabla de estadísticas:', err);
      }
    });
  }

  /**
   * Genera una clave única para la entrada de caché
   */
  private generateCacheKey(question: string, configuration: any, llmModel: string): string {
    const data = JSON.stringify({
      question: question.toLowerCase().trim(),
      brand: configuration.name,
      competitors: configuration.competitors?.sort(),
      llmModel
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Calcula la fecha de expiración
   */
  private calculateExpirationDate(ttlDays?: number): string {
    const days = ttlDays || this.DEFAULT_TTL_DAYS;
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + days);
    return expirationDate.toISOString();
  }

  /**
   * Intenta obtener una respuesta del caché
   */
  async get(question: string, configuration: any, llmModel: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos de caché no inicializada'));
        return;
      }

      const key = this.generateCacheKey(question, configuration, llmModel);
      const now = new Date().toISOString();

      const query = `
        SELECT * FROM llm_cache
        WHERE key = ? AND expires_at > ?
      `;

      this.db.get(query, [key, now], (err, row: any) => {
        if (err) {
          console.error('❌ Error al buscar en caché:', err);
          this.stats.misses++;
          reject(err);
        } else if (!row) {
          console.log(`⚠️ CACHE MISS: ${question.substring(0, 60)}...`);
          this.stats.misses++;
          this.logCacheEvent('miss', { question, llmModel });
          resolve(null);
        } else {
          console.log(`✅ CACHE HIT: ${question.substring(0, 60)}... (${row.hits} hits previos)`);
          this.stats.hits++;
          this.incrementHits(key);
          this.logCacheEvent('hit', { question, llmModel, hits: row.hits + 1 });
          resolve(row.response);
        }
      });
    });
  }

  /**
   * Guarda una respuesta en el caché
   */
  async set(
    question: string,
    response: string,
    configuration: any,
    llmModel: string,
    ttlDays?: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos de caché no inicializada'));
        return;
      }

      const key = this.generateCacheKey(question, configuration, llmModel);
      const expiresAt = this.calculateExpirationDate(ttlDays);

      const query = `
        INSERT OR REPLACE INTO llm_cache (
          key, question, response, llm_model, configuration, expires_at, hits
        ) VALUES (?, ?, ?, ?, ?, ?, 0)
      `;

      const params = [
        key,
        question,
        response,
        llmModel,
        JSON.stringify(configuration),
        expiresAt
      ];

      this.db.run(query, params, (err) => {
        if (err) {
          console.error('❌ Error al guardar en caché:', err);
          reject(err);
        } else {
          console.log(`💾 Respuesta cacheada: ${question.substring(0, 60)}... (expira: ${expiresAt.split('T')[0]})`);
          this.logCacheEvent('set', { question, llmModel, expiresAt });
          resolve();
        }
      });
    });
  }

  /**
   * Incrementa el contador de hits de una entrada
   */
  private incrementHits(key: string): void {
    if (!this.db) return;

    const query = 'UPDATE llm_cache SET hits = hits + 1 WHERE key = ?';
    this.db.run(query, [key], (err) => {
      if (err) {
        console.error('❌ Error al incrementar hits:', err);
      }
    });
  }

  /**
   * Registra eventos de caché para análisis
   */
  private logCacheEvent(eventType: string, details: any): void {
    if (!this.db) return;

    const query = `
      INSERT INTO cache_stats (event_type, details)
      VALUES (?, ?)
    `;

    this.db.run(query, [eventType, JSON.stringify(details)], (err) => {
      if (err) {
        console.error('❌ Error al registrar evento de caché:', err);
      }
    });
  }

  /**
   * Limpia entradas expiradas del caché
   */
  async cleanExpired(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos de caché no inicializada'));
        return;
      }

      const now = new Date().toISOString();
      const query = 'DELETE FROM llm_cache WHERE expires_at <= ?';

      this.db.run(query, [now], function(err) {
        if (err) {
          console.error('❌ Error al limpiar caché expirado:', err);
          reject(err);
        } else {
          console.log(`🧹 Limpieza de caché: ${this.changes} entradas eliminadas`);
          resolve(this.changes);
        }
      });
    });
  }

  /**
   * Invalida todo el caché
   */
  async invalidateAll(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos de caché no inicializada'));
        return;
      }

      const query = 'DELETE FROM llm_cache';

      this.db.run(query, (err) => {
        if (err) {
          console.error('❌ Error al invalidar caché:', err);
          reject(err);
        } else {
          console.log('🗑️ Caché completamente invalidado');
          this.logCacheEvent('invalidate_all', {});
          resolve();
        }
      });
    });
  }

  /**
   * Invalida caché para una marca específica
   */
  async invalidateByBrand(brand: string): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos de caché no inicializada'));
        return;
      }

      const query = `
        DELETE FROM llm_cache
        WHERE configuration LIKE ?
      `;

      this.db.run(query, [`%"name":"${brand}"%`], function(err) {
        if (err) {
          console.error('❌ Error al invalidar caché por marca:', err);
          reject(err);
        } else {
          console.log(`🗑️ Caché invalidado para marca ${brand}: ${this.changes} entradas eliminadas`);
          resolve(this.changes);
        }
      });
    });
  }

  /**
   * Obtiene estadísticas del caché
   */
  async getStats(): Promise<CacheStats> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos de caché no inicializada'));
        return;
      }

      const query = `
        SELECT
          COUNT(*) as total_entries,
          SUM(hits) as total_hits,
          SUM(LENGTH(response)) as cache_size,
          MIN(created_at) as oldest_entry,
          MAX(created_at) as newest_entry
        FROM llm_cache
        WHERE expires_at > datetime('now')
      `;

      this.db.get(query, [], (err, row: any) => {
        if (err) {
          console.error('❌ Error al obtener estadísticas:', err);
          reject(err);
        } else {
          const totalRequests = this.stats.hits + this.stats.misses;
          const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

          const stats: CacheStats = {
            totalEntries: row.total_entries || 0,
            hitRate: parseFloat(hitRate.toFixed(2)),
            totalHits: this.stats.hits,
            totalMisses: this.stats.misses,
            cacheSize: row.cache_size || 0,
            oldestEntry: row.oldest_entry || '',
            newestEntry: row.newest_entry || ''
          };

          resolve(stats);
        }
      });
    });
  }

  /**
   * Obtiene las entradas más populares del caché
   */
  async getTopEntries(limit: number = 10): Promise<CacheEntry[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos de caché no inicializada'));
        return;
      }

      const query = `
        SELECT * FROM llm_cache
        WHERE expires_at > datetime('now')
        ORDER BY hits DESC
        LIMIT ?
      `;

      this.db.all(query, [limit], (err, rows: any[]) => {
        if (err) {
          console.error('❌ Error al obtener top entries:', err);
          reject(err);
        } else {
          const entries: CacheEntry[] = rows.map(row => ({
            key: row.key,
            question: row.question,
            response: row.response,
            llmModel: row.llm_model,
            configuration: row.configuration,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            hits: row.hits
          }));
          resolve(entries);
        }
      });
    });
  }

  close(): void {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('❌ Error al cerrar base de datos de caché:', err);
        } else {
          console.log('🔒 Base de datos de caché cerrada');
        }
      });
    }
  }
}

export const cacheService = new CacheService();
