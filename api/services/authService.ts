/**
 * Servicio de autenticación multi-tenant
 * Gestiona usuarios, sesiones y tokens JWT
 */
import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  expiresIn: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'mediciones-ia-secret-key-change-in-production';
const JWT_EXPIRES_IN = 7 * 24 * 60 * 60; // 7 días en segundos

class AuthService {
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
          console.error('Error al abrir la base de datos para auth:', err);
          reject(err);
          return;
        }
        console.log('AuthService: Base de datos SQLite conectada');
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

      // Tabla de usuarios (tenants)
      const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      // Tabla de sesiones (para invalidación de tokens)
      const createSessionsTable = `
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `;

      // Tabla de API keys por usuario
      const createApiKeysTable = `
        CREATE TABLE IF NOT EXISTS user_api_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          api_key_encrypted TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, provider)
        )
      `;

      this.db.serialize(() => {
        this.db!.run(createUsersTable, (err) => {
          if (err) console.error('Error creando tabla users:', err);
        });

        this.db!.run(createSessionsTable, (err) => {
          if (err) console.error('Error creando tabla sessions:', err);
        });

        this.db!.run(createApiKeysTable, (err) => {
          if (err) console.error('Error creando tabla user_api_keys:', err);
        });

        // Índices
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)');
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON user_api_keys(user_id)', () => {
          console.log('AuthService: Tablas creadas/verificadas');
          resolve();
        });
      });
    });
  }

  private async ensureInitialized(): Promise<void> {
    await this.initialized;
  }

  /**
   * Registrar un nuevo usuario
   */
  async register(input: CreateUserInput): Promise<AuthResponse> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      // Validar email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(input.email)) {
        reject(new Error('Email inválido'));
        return;
      }

      // Validar password (mínimo 6 caracteres)
      if (input.password.length < 6) {
        reject(new Error('La contraseña debe tener al menos 6 caracteres'));
        return;
      }

      // Validar nombre
      if (!input.name || input.name.trim().length < 2) {
        reject(new Error('El nombre debe tener al menos 2 caracteres'));
        return;
      }

      // Verificar si el email ya existe
      const checkQuery = 'SELECT id FROM users WHERE email = ?';
      this.db.get(checkQuery, [input.email.toLowerCase()], async (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row) {
          reject(new Error('El email ya está registrado'));
          return;
        }

        try {
          // Hash del password
          const passwordHash = await bcrypt.hash(input.password, 12);

          const userId = uuidv4();
          const now = new Date().toISOString();

          const insertQuery = `
            INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `;

          this.db!.run(
            insertQuery,
            [userId, input.email.toLowerCase(), passwordHash, input.name.trim(), now, now],
            async (insertErr) => {
              if (insertErr) {
                reject(insertErr);
                return;
              }

              const user: User = {
                id: userId,
                email: input.email.toLowerCase(),
                name: input.name.trim(),
                createdAt: now,
                updatedAt: now
              };

              // Generar token
              const token = this.generateToken(user);

              // Guardar sesión
              await this.createSession(userId, token);

              resolve({
                user,
                token,
                expiresIn: JWT_EXPIRES_IN
              });
            }
          );
        } catch (hashErr) {
          reject(hashErr);
        }
      });
    });
  }

  /**
   * Iniciar sesión
   */
  async login(input: LoginInput): Promise<AuthResponse> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const query = 'SELECT * FROM users WHERE email = ?';
      this.db.get(query, [input.email.toLowerCase()], async (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          reject(new Error('Credenciales inválidas'));
          return;
        }

        try {
          // Verificar password
          const isValid = await bcrypt.compare(input.password, row.password_hash);
          if (!isValid) {
            reject(new Error('Credenciales inválidas'));
            return;
          }

          const user: User = {
            id: row.id,
            email: row.email,
            name: row.name,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          };

          // Generar token
          const token = this.generateToken(user);

          // Guardar sesión
          await this.createSession(user.id, token);

          resolve({
            user,
            token,
            expiresIn: JWT_EXPIRES_IN
          });
        } catch (compareErr) {
          reject(compareErr);
        }
      });
    });
  }

  /**
   * Cerrar sesión (invalidar token)
   */
  async logout(userId: string, token: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const tokenHash = this.hashToken(token);
      const query = 'DELETE FROM sessions WHERE user_id = ? AND token_hash = ?';

      this.db.run(query, [userId, tokenHash], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Cerrar todas las sesiones del usuario
   */
  async logoutAll(userId: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const query = 'DELETE FROM sessions WHERE user_id = ?';

      this.db.run(query, [userId], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Verificar token y obtener usuario
   */
  async verifyToken(token: string): Promise<User | null> {
    await this.ensureInitialized();

    try {
      const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;

      // Verificar que la sesión existe y no ha expirado
      const sessionValid = await this.isSessionValid(payload.userId, token);
      if (!sessionValid) {
        return null;
      }

      return await this.getUserById(payload.userId);
    } catch (err) {
      return null;
    }
  }

  /**
   * Obtener usuario por ID
   */
  async getUserById(id: string): Promise<User | null> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const query = 'SELECT id, email, name, created_at, updated_at FROM users WHERE id = ?';
      this.db.get(query, [id], (err, row: any) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve({
            id: row.id,
            email: row.email,
            name: row.name,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          });
        }
      });
    });
  }

  /**
   * Actualizar perfil del usuario
   */
  async updateUser(id: string, updates: { name?: string; email?: string }): Promise<User | null> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const now = new Date().toISOString();
      const fields: string[] = ['updated_at = ?'];
      const params: any[] = [now];

      if (updates.name !== undefined) {
        fields.push('name = ?');
        params.push(updates.name.trim());
      }
      if (updates.email !== undefined) {
        fields.push('email = ?');
        params.push(updates.email.toLowerCase());
      }

      params.push(id);

      const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;

      this.db.run(query, params, async (err) => {
        if (err) {
          reject(err);
        } else {
          const updated = await this.getUserById(id);
          resolve(updated);
        }
      });
    });
  }

  /**
   * Cambiar contraseña
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      if (newPassword.length < 6) {
        reject(new Error('La nueva contraseña debe tener al menos 6 caracteres'));
        return;
      }

      const query = 'SELECT password_hash FROM users WHERE id = ?';
      this.db.get(query, [userId], async (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          reject(new Error('Usuario no encontrado'));
          return;
        }

        try {
          const isValid = await bcrypt.compare(currentPassword, row.password_hash);
          if (!isValid) {
            reject(new Error('Contraseña actual incorrecta'));
            return;
          }

          const newHash = await bcrypt.hash(newPassword, 12);
          const updateQuery = 'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?';

          this.db!.run(updateQuery, [newHash, new Date().toISOString(), userId], async (updateErr) => {
            if (updateErr) {
              reject(updateErr);
            } else {
              // Invalidar todas las sesiones
              await this.logoutAll(userId);
              resolve();
            }
          });
        } catch (hashErr) {
          reject(hashErr);
        }
      });
    });
  }

  // ==================== API KEYS ====================

  /**
   * Guardar API key para un usuario
   */
  async saveApiKey(userId: string, provider: string, apiKey: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const id = uuidv4();
      const now = new Date().toISOString();
      // Nota: En producción, encriptar con clave de servidor
      const encrypted = Buffer.from(apiKey).toString('base64');

      const query = `
        INSERT INTO user_api_keys (id, user_id, provider, api_key_encrypted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, provider) DO UPDATE SET
          api_key_encrypted = excluded.api_key_encrypted,
          updated_at = excluded.updated_at
      `;

      this.db.run(query, [id, userId, provider, encrypted, now, now], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Obtener API keys del usuario
   */
  async getApiKeys(userId: string): Promise<{ [provider: string]: string }> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const query = 'SELECT provider, api_key_encrypted FROM user_api_keys WHERE user_id = ?';
      this.db.all(query, [userId], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const keys: { [provider: string]: string } = {};
          rows.forEach(row => {
            keys[row.provider] = Buffer.from(row.api_key_encrypted, 'base64').toString('utf-8');
          });
          resolve(keys);
        }
      });
    });
  }

  /**
   * Eliminar API key del usuario
   */
  async deleteApiKey(userId: string, provider: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const query = 'DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?';
      this.db.run(query, [userId, provider], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // ==================== MÉTODOS PRIVADOS ====================

  private generateToken(user: User): string {
    const payload: AuthTokenPayload = {
      userId: user.id,
      email: user.email
    };

    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  private hashToken(token: string): string {
    return Buffer.from(token).toString('base64').substring(0, 64);
  }

  private async createSession(userId: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const sessionId = uuidv4();
      const tokenHash = this.hashToken(token);
      const expiresAt = new Date(Date.now() + JWT_EXPIRES_IN * 1000).toISOString();

      const query = `
        INSERT INTO sessions (id, user_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
      `;

      this.db.run(query, [sessionId, userId, tokenHash, expiresAt], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private async isSessionValid(userId: string, token: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const tokenHash = this.hashToken(token);
      const query = `
        SELECT id FROM sessions
        WHERE user_id = ? AND token_hash = ? AND expires_at > datetime('now')
      `;

      this.db.get(query, [userId, tokenHash], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(!!row);
        }
      });
    });
  }

  /**
   * Limpiar sesiones expiradas
   */
  async cleanupExpiredSessions(): Promise<number> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const query = "DELETE FROM sessions WHERE expires_at <= datetime('now')";
      this.db.run(query, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }
}

export const authService = new AuthService();
