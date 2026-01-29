/**
 * Servicio de administración
 * Gestiona whitelist de emails/dominios y usuarios
 */
import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { ALLOWED_EMAIL_DOMAINS, ALLOWED_EMAILS, RESTRICT_REGISTRATION, AI_MODELS, type AIModelInfo } from '../config/constants.js';

export interface WhitelistConfig {
  emails: string[];
  domains: string[];
  restrictionEnabled: boolean;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface ManagedAIModel extends AIModelInfo {
  enabled: boolean;
  order: number;
}

class AdminService {
  private db: Database | null = null;
  private dbPath: string;
  private initialized: Promise<void>;

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'analysis.db');
    this.initialized = this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error al abrir la base de datos para admin:', err);
          reject(err);
          return;
        }
        this.createTables().then(resolve).catch(reject);
      });
    });
  }

  private async createTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      // Tabla de configuración de whitelist
      const createWhitelistTable = `
        CREATE TABLE IF NOT EXISTS whitelist_config (
          id INTEGER PRIMARY KEY,
          type TEXT NOT NULL,
          value TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, value)
        )
      `;

      // Tabla de settings
      const createSettingsTable = `
        CREATE TABLE IF NOT EXISTS admin_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      // Tabla de modelos de IA gestionables
      const createAIModelsTable = `
        CREATE TABLE IF NOT EXISTS ai_models (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          provider TEXT NOT NULL,
          description TEXT,
          strengths TEXT,
          context_window TEXT,
          pricing TEXT,
          recommended INTEGER DEFAULT 0,
          enabled INTEGER DEFAULT 1,
          requires_api_key TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      this.db.run(createWhitelistTable, (err) => {
        if (err) console.error('Error creando tabla whitelist_config:', err);
      });

      this.db.run(createSettingsTable, (err) => {
        if (err) console.error('Error creando tabla admin_settings:', err);
      });

      this.db.run(createAIModelsTable, (err) => {
        if (err) console.error('Error creando tabla ai_models:', err);

        // Inicializar con valores de constants.ts si no existen
        this.initializeDefaults().then(resolve).catch(reject);
      });
    });
  }

  private async initializeDefaults(): Promise<void> {
    // NO llamar a ensureInitialized aquí - esto se llama DESDE createTables
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      // Verificar si ya hay datos
      this.db.get('SELECT COUNT(*) as count FROM whitelist_config', (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        const insertDefaults = () => {
          // Insertar valores iniciales desde constants
          let pending = ALLOWED_EMAILS.length + ALLOWED_EMAIL_DOMAINS.length;
          if (pending === 0) {
            // Configurar restricción inicial
            this.db!.run(
              `INSERT OR IGNORE INTO admin_settings (key, value) VALUES (?, ?)`,
              ['restrict_registration', RESTRICT_REGISTRATION ? 'true' : 'false'],
              () => resolve()
            );
            return;
          }

          const checkDone = () => {
            pending--;
            if (pending <= 0) {
              // Configurar restricción inicial
              this.db!.run(
                `INSERT OR IGNORE INTO admin_settings (key, value) VALUES (?, ?)`,
                ['restrict_registration', RESTRICT_REGISTRATION ? 'true' : 'false'],
                () => resolve()
              );
            }
          };

          for (const email of ALLOWED_EMAILS) {
            this.db!.run(
              'INSERT OR IGNORE INTO whitelist_config (type, value) VALUES (?, ?)',
              ['email', email.toLowerCase().trim()],
              checkDone
            );
          }
          for (const domain of ALLOWED_EMAIL_DOMAINS) {
            this.db!.run(
              'INSERT OR IGNORE INTO whitelist_config (type, value) VALUES (?, ?)',
              ['domain', domain.toLowerCase().trim()],
              checkDone
            );
          }
        };

        if (row.count === 0) {
          insertDefaults();
        } else {
          // Solo configurar restricción inicial
          this.db!.run(
            `INSERT OR IGNORE INTO admin_settings (key, value) VALUES (?, ?)`,
            ['restrict_registration', RESTRICT_REGISTRATION ? 'true' : 'false'],
            () => {
              // Inicializar modelos de IA
              this.initializeAIModels().then(() => resolve()).catch(reject);
            }
          );
        }
      });
    });
  }

  /**
   * Inicializar modelos de IA desde constants.ts si no existen
   */
  private async initializeAIModels(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      // Verificar si ya hay modelos
      this.db.get('SELECT COUNT(*) as count FROM ai_models', (err, row: any) => {
        if (err) {
          // Si la tabla no existe aún, resolver sin hacer nada
          if (err.message.includes('no such table')) {
            resolve();
            return;
          }
          reject(err);
          return;
        }

        if (row.count === 0) {
          // Insertar modelos desde constants.ts
          let pending = AI_MODELS.length;
          if (pending === 0) {
            resolve();
            return;
          }

          AI_MODELS.forEach((model, index) => {
            this.db!.run(
              `INSERT OR IGNORE INTO ai_models
               (id, name, provider, description, strengths, context_window, pricing, recommended, enabled, requires_api_key, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                model.id,
                model.name,
                model.provider,
                model.description,
                JSON.stringify(model.strengths),
                model.contextWindow,
                model.pricing,
                model.recommended ? 1 : 0,
                1, // enabled por defecto
                model.requiresApiKey,
                index
              ],
              () => {
                pending--;
                if (pending <= 0) {
                  console.log('✅ Modelos de IA inicializados en base de datos');
                  resolve();
                }
              }
            );
          });
        } else {
          resolve();
        }
      });
    });
  }

  private async ensureInitialized(): Promise<void> {
    await this.initialized;
  }

  /**
   * Obtener configuración completa del whitelist
   */
  async getWhitelistConfig(): Promise<WhitelistConfig> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      const emails: string[] = [];
      const domains: string[] = [];

      this.db.all('SELECT type, value FROM whitelist_config', (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        for (const row of rows || []) {
          if (row.type === 'email') {
            emails.push(row.value);
          } else if (row.type === 'domain') {
            domains.push(row.value);
          }
        }

        // Obtener setting de restricción
        this.db!.get('SELECT value FROM admin_settings WHERE key = ?', ['restrict_registration'], (err2, settingRow: any) => {
          if (err2) {
            reject(err2);
            return;
          }

          const restrictionEnabled = settingRow ? settingRow.value === 'true' : RESTRICT_REGISTRATION;

          resolve({
            emails,
            domains,
            restrictionEnabled
          });
        });
      });
    });
  }

  /**
   * Añadir email al whitelist
   */
  async addAllowedEmail(email: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      const emailLower = email.toLowerCase().trim();

      this.db.run(
        'INSERT OR IGNORE INTO whitelist_config (type, value) VALUES (?, ?)',
        ['email', emailLower],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Eliminar email del whitelist
   */
  async removeAllowedEmail(email: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      this.db.run(
        'DELETE FROM whitelist_config WHERE type = ? AND value = ?',
        ['email', email.toLowerCase().trim()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Añadir dominio al whitelist
   */
  async addAllowedDomain(domain: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      const domainLower = domain.toLowerCase().trim();

      this.db.run(
        'INSERT OR IGNORE INTO whitelist_config (type, value) VALUES (?, ?)',
        ['domain', domainLower],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Eliminar dominio del whitelist
   */
  async removeAllowedDomain(domain: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      this.db.run(
        'DELETE FROM whitelist_config WHERE type = ? AND value = ?',
        ['domain', domain.toLowerCase().trim()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Activar/desactivar restricción de registro
   */
  async setRestrictionEnabled(enabled: boolean): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      this.db.run(
        `INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
        ['restrict_registration', enabled ? 'true' : 'false'],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Verificar si un email puede registrarse
   */
  async canRegister(email: string): Promise<{ allowed: boolean; reason?: string }> {
    const config = await this.getWhitelistConfig();

    if (!config.restrictionEnabled) {
      return { allowed: true };
    }

    const emailLower = email.toLowerCase();
    const domain = emailLower.split('@')[1];

    // Verificar email específico
    if (config.emails.includes(emailLower)) {
      return { allowed: true };
    }

    // Verificar dominio
    if (config.domains.includes(domain)) {
      return { allowed: true };
    }

    // Si hay whitelist definido pero el email no está
    if (config.emails.length > 0 || config.domains.length > 0) {
      return {
        allowed: false,
        reason: 'El registro está restringido. Tu email o dominio no está autorizado.'
      };
    }

    // Si restricción activa pero sin whitelist, bloquear
    return {
      allowed: false,
      reason: 'El registro está deshabilitado. Contacta al administrador.'
    };
  }

  /**
   * Obtener todos los usuarios registrados
   */
  async getAllUsers(): Promise<UserInfo[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      this.db.all(
        'SELECT id, email, name, created_at as createdAt FROM users ORDER BY created_at DESC',
        (err, rows: any[]) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  }

  /**
   * Eliminar un usuario
   */
  async deleteUser(userId: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      // Eliminar sesiones del usuario
      this.db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);

      // Eliminar API keys del usuario
      this.db.run('DELETE FROM user_api_keys WHERE user_id = ?', [userId]);

      // Eliminar usuario
      this.db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // ==================== GESTIÓN DE MODELOS DE IA ====================

  /**
   * Obtener todos los modelos de IA
   */
  async getAllAIModels(): Promise<ManagedAIModel[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      this.db.all(
        'SELECT * FROM ai_models ORDER BY sort_order ASC, name ASC',
        (err, rows: any[]) => {
          if (err) {
            // Si la tabla no existe, devolver modelos de constants
            if (err.message.includes('no such table')) {
              resolve(AI_MODELS.map((m, i) => ({ ...m, enabled: true, order: i })));
              return;
            }
            reject(err);
            return;
          }

          const models: ManagedAIModel[] = (rows || []).map(row => ({
            id: row.id,
            name: row.name,
            provider: row.provider as 'openai' | 'anthropic' | 'google',
            description: row.description || '',
            strengths: row.strengths ? JSON.parse(row.strengths) : [],
            contextWindow: row.context_window || '',
            pricing: row.pricing || '',
            recommended: row.recommended === 1,
            enabled: row.enabled === 1,
            requiresApiKey: row.requires_api_key || '',
            order: row.sort_order || 0
          }));

          resolve(models);
        }
      );
    });
  }

  /**
   * Obtener solo modelos habilitados (para uso en la aplicación)
   */
  async getEnabledAIModels(): Promise<AIModelInfo[]> {
    const allModels = await this.getAllAIModels();
    return allModels
      .filter(m => m.enabled)
      .map(({ enabled, order, ...model }) => model);
  }

  /**
   * Añadir un nuevo modelo de IA
   */
  async addAIModel(model: Omit<ManagedAIModel, 'order'>): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      // Obtener el siguiente orden
      this.db.get('SELECT MAX(sort_order) as maxOrder FROM ai_models', (err, row: any) => {
        const nextOrder = (row?.maxOrder || 0) + 1;

        this.db!.run(
          `INSERT INTO ai_models
           (id, name, provider, description, strengths, context_window, pricing, recommended, enabled, requires_api_key, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            model.id,
            model.name,
            model.provider,
            model.description,
            JSON.stringify(model.strengths),
            model.contextWindow,
            model.pricing,
            model.recommended ? 1 : 0,
            model.enabled ? 1 : 0,
            model.requiresApiKey,
            nextOrder
          ],
          (err) => {
            if (err) reject(err);
            else {
              console.log(`✅ Modelo de IA añadido: ${model.name}`);
              resolve();
            }
          }
        );
      });
    });
  }

  /**
   * Actualizar un modelo de IA
   */
  async updateAIModel(modelId: string, updates: Partial<ManagedAIModel>): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      const fields: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name);
      }
      if (updates.provider !== undefined) {
        fields.push('provider = ?');
        values.push(updates.provider);
      }
      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
      }
      if (updates.strengths !== undefined) {
        fields.push('strengths = ?');
        values.push(JSON.stringify(updates.strengths));
      }
      if (updates.contextWindow !== undefined) {
        fields.push('context_window = ?');
        values.push(updates.contextWindow);
      }
      if (updates.pricing !== undefined) {
        fields.push('pricing = ?');
        values.push(updates.pricing);
      }
      if (updates.recommended !== undefined) {
        fields.push('recommended = ?');
        values.push(updates.recommended ? 1 : 0);
      }
      if (updates.enabled !== undefined) {
        fields.push('enabled = ?');
        values.push(updates.enabled ? 1 : 0);
      }
      if (updates.requiresApiKey !== undefined) {
        fields.push('requires_api_key = ?');
        values.push(updates.requiresApiKey);
      }
      if (updates.order !== undefined) {
        fields.push('sort_order = ?');
        values.push(updates.order);
      }

      if (fields.length === 0) {
        resolve();
        return;
      }

      fields.push("updated_at = datetime('now')");
      values.push(modelId);

      this.db.run(
        `UPDATE ai_models SET ${fields.join(', ')} WHERE id = ?`,
        values,
        (err) => {
          if (err) reject(err);
          else {
            console.log(`✅ Modelo de IA actualizado: ${modelId}`);
            resolve();
          }
        }
      );
    });
  }

  /**
   * Eliminar un modelo de IA
   */
  async deleteAIModel(modelId: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      this.db.run('DELETE FROM ai_models WHERE id = ?', [modelId], (err) => {
        if (err) reject(err);
        else {
          console.log(`✅ Modelo de IA eliminado: ${modelId}`);
          resolve();
        }
      });
    });
  }

  /**
   * Activar/desactivar un modelo de IA
   */
  async toggleAIModel(modelId: string, enabled: boolean): Promise<void> {
    return this.updateAIModel(modelId, { enabled });
  }

  /**
   * Reordenar modelos de IA
   */
  async reorderAIModels(modelIds: string[]): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      let pending = modelIds.length;
      if (pending === 0) {
        resolve();
        return;
      }

      modelIds.forEach((id, index) => {
        this.db!.run(
          'UPDATE ai_models SET sort_order = ? WHERE id = ?',
          [index, id],
          () => {
            pending--;
            if (pending <= 0) resolve();
          }
        );
      });
    });
  }

  /**
   * Sincronizar modelos desde constants.ts (añadir nuevos que no existan)
   */
  async syncAIModelsFromConstants(): Promise<{ added: number; existing: number }> {
    await this.ensureInitialized();

    const existingModels = await this.getAllAIModels();
    const existingIds = new Set(existingModels.map(m => m.id));

    let added = 0;
    let existing = 0;

    for (const model of AI_MODELS) {
      if (existingIds.has(model.id)) {
        existing++;
      } else {
        await this.addAIModel({ ...model, enabled: true });
        added++;
      }
    }

    console.log(`🔄 Sincronización de modelos: ${added} añadidos, ${existing} existentes`);
    return { added, existing };
  }
}

export const adminService = new AdminService();
