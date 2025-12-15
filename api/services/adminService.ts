/**
 * Servicio de administración
 * Gestiona whitelist de emails/dominios y usuarios
 */
import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { ALLOWED_EMAIL_DOMAINS, ALLOWED_EMAILS, RESTRICT_REGISTRATION } from '../config/constants.js';

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

      this.db.run(createWhitelistTable, (err) => {
        if (err) console.error('Error creando tabla whitelist_config:', err);
      });

      this.db.run(createSettingsTable, (err) => {
        if (err) console.error('Error creando tabla admin_settings:', err);

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
            () => resolve()
          );
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
}

export const adminService = new AdminService();
