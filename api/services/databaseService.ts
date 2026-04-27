import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import { AnalysisResult } from './openaiService.js';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export interface Project {
  id: string;
  userId?: string; // Multi-tenant: propietario del proyecto
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedAnalysis {
  id: string;
  userId?: string; // Multi-tenant: propietario del análisis
  projectId?: string;
  timestamp: string;
  configuration: {
    brand: string;
    competitors: string[];
    templateId: string;
    questionsCount: number;
  };
  results: AnalysisResult;
  metadata?: {
    duration?: number;
    modelsUsed?: string[];
    totalQuestions?: number;
  };
}

export type ScheduledReportType = 'llm' | 'aio';
export type ScheduledReportFrequency = 'daily' | 'weekly' | 'monthly';
export type ScheduledReportStatus = 'success' | 'error' | 'running';

export interface ScheduledReport {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  type: ScheduledReportType;
  configurationId: string | null;
  payload: Record<string, any>;
  frequency: ScheduledReportFrequency;
  hour: number;
  weekday: number | null;
  dayOfMonth: number | null;
  timezone: string;
  enabled: boolean;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastStatus: ScheduledReportStatus | null;
  lastError: string | null;
  lastAnalysisId: string | null;
  errorsAcknowledgedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateScheduledReportInput {
  userId: string;
  projectId: string;
  name: string;
  type: ScheduledReportType;
  configurationId?: string | null;
  payload: Record<string, any>;
  frequency: ScheduledReportFrequency;
  hour: number;
  weekday?: number | null;
  dayOfMonth?: number | null;
  timezone?: string;
  enabled?: boolean;
  nextRunAt: number;
}

export interface UpdateScheduledReportInput {
  name?: string;
  payload?: Record<string, any>;
  configurationId?: string | null;
  frequency?: ScheduledReportFrequency;
  hour?: number;
  weekday?: number | null;
  dayOfMonth?: number | null;
  timezone?: string;
  enabled?: boolean;
  nextRunAt?: number;
}

class DatabaseService {
  private db: Database | null = null;
  private dbPath: string;
  private initialized: Promise<void>;

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'analysis.db');
    this.initialized = this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    // Crear directorio data si no existe
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error al abrir la base de datos:', err);
          reject(err);
          return;
        }
        console.log('Base de datos SQLite conectada');
        this.createTables()
          .then(() => this.migrateOrphanDataToAllUsers())
          .then(resolve)
          .catch(reject);
      });
    });
  }

  private async createTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      // Tabla de proyectos con user_id para multi-tenant
      const createProjectsTable = `
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          name TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `;

      // Tabla de análisis con user_id para multi-tenant
      const createAnalysisTable = `
        CREATE TABLE IF NOT EXISTS analysis (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          project_id TEXT,
          timestamp TEXT NOT NULL,
          brand TEXT NOT NULL,
          competitors TEXT NOT NULL,
          template_id TEXT NOT NULL,
          questions_count INTEGER NOT NULL,
          configuration TEXT NOT NULL,
          results TEXT NOT NULL,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (project_id) REFERENCES projects(id)
        )
      `;

      this.db.serialize(() => {
        this.db!.run(createProjectsTable, (err) => {
          if (err) {
            console.error('Error al crear tabla de proyectos:', err);
          } else {
            console.log('Tabla de proyectos creada/verificada');
          }
        });

        this.db!.run(createAnalysisTable, (err) => {
          if (err) {
            console.error('Error al crear la tabla de análisis:', err);
          } else {
            console.log('Tabla de análisis creada/verificada');
          }
        });

        // Migraciones: añadir columnas user_id si no existen
        this.db!.run('ALTER TABLE projects ADD COLUMN user_id TEXT REFERENCES users(id)', (err) => {
          if (err && !err.message.includes('duplicate column')) {
            // Ignorar si ya existe
          }
        });

        this.db!.run('ALTER TABLE analysis ADD COLUMN user_id TEXT REFERENCES users(id)', (err) => {
          if (err && !err.message.includes('duplicate column')) {
            // Ignorar si ya existe
          }
        });

        // Añadir project_id si no existe (migración anterior)
        this.db!.run('ALTER TABLE analysis ADD COLUMN project_id TEXT REFERENCES projects(id)', (err) => {
          if (err && !err.message.includes('duplicate column')) {
            // Ignorar si ya existe
          }
        });

        // Tabla de automatizaciones (schedules) de informes LLM/AIO
        const createScheduledReportsTable = `
          CREATE TABLE IF NOT EXISTS scheduled_reports (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            configuration_id TEXT,
            payload TEXT NOT NULL,
            frequency TEXT NOT NULL,
            hour INTEGER NOT NULL,
            weekday INTEGER,
            day_of_month INTEGER,
            timezone TEXT NOT NULL DEFAULT 'Europe/Madrid',
            enabled INTEGER NOT NULL DEFAULT 1,
            next_run_at INTEGER,
            last_run_at INTEGER,
            last_status TEXT,
            last_error TEXT,
            last_analysis_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          )
        `;
        this.db!.run(createScheduledReportsTable, (err) => {
          if (err) {
            console.error('Error al crear tabla scheduled_reports:', err);
          } else {
            console.log('Tabla scheduled_reports creada/verificada');
          }
        });

        // Migración idempotente: columna de acknowledgement de errores
        this.db!.run('ALTER TABLE scheduled_reports ADD COLUMN errors_acknowledged_at INTEGER', (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Error añadiendo errors_acknowledged_at:', err);
          }
        });

        // Crear índices para optimización multi-tenant
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)');
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_analysis_user_id ON analysis(user_id)');
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_analysis_project_id ON analysis(project_id)');
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_scheduled_reports_user_id ON scheduled_reports(user_id)');
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_scheduled_reports_project_id ON scheduled_reports(project_id)');
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_scheduled_reports_due ON scheduled_reports(enabled, next_run_at)', () => {
          console.log('DatabaseService: Índices multi-tenant creados/verificados');
          resolve();
        });
      });
    });
  }

  private async ensureInitialized(): Promise<void> {
    await this.initialized;
  }

  /**
   * Migración: clona proyectos, análisis y configuraciones con user_id=NULL
   * a TODOS los usuarios existentes. Solo corre una vez.
   */
  private async migrateOrphanDataToAllUsers(): Promise<void> {
    if (!this.db) return;

    // Crear tabla de control de migraciones
    await new Promise<void>((resolve) => {
      this.db!.run(
        'CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, executed_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
        () => resolve()
      );
    });

    // Verificar si ya se ejecutó
    const alreadyRun = await new Promise<boolean>((resolve) => {
      this.db!.get(
        "SELECT 1 FROM migrations WHERE name = 'orphan_data_to_all_users'",
        (err, row) => resolve(!!row)
      );
    });

    if (alreadyRun) return;

    // Obtener usuarios
    const users: { id: string }[] = await new Promise((resolve, reject) => {
      this.db!.all('SELECT id FROM users', (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    if (users.length === 0) {
      console.log('Migración: No hay usuarios, se omite');
      return;
    }

    // Obtener proyectos huérfanos
    const orphanProjects: any[] = await new Promise((resolve, reject) => {
      this.db!.all('SELECT * FROM projects WHERE user_id IS NULL', (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Obtener análisis huérfanos
    const orphanAnalyses: any[] = await new Promise((resolve, reject) => {
      this.db!.all('SELECT * FROM analysis WHERE user_id IS NULL', (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    if (orphanProjects.length === 0 && orphanAnalyses.length === 0) {
      console.log('Migración: No hay datos huérfanos');
      await new Promise<void>((resolve) => {
        this.db!.run("INSERT INTO migrations (name) VALUES ('orphan_data_to_all_users')", () => resolve());
      });
      return;
    }

    console.log(`Migración: ${orphanProjects.length} proyectos y ${orphanAnalyses.length} análisis huérfanos → ${users.length} usuarios`);

    for (const user of users) {
      // Mapa de project_id viejo → nuevo para este usuario
      const projectIdMap: Record<string, string> = {};

      // Clonar proyectos
      for (const proj of orphanProjects) {
        const newId = uuidv4();
        projectIdMap[proj.id] = newId;
        await new Promise<void>((resolve, reject) => {
          this.db!.run(
            'INSERT INTO projects (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [newId, user.id, proj.name, proj.description, proj.created_at, proj.updated_at],
            (err) => { if (err) reject(err); else resolve(); }
          );
        });
      }

      // Clonar análisis
      for (const analysis of orphanAnalyses) {
        const newId = uuidv4();
        const newProjectId = analysis.project_id ? (projectIdMap[analysis.project_id] || null) : null;
        await new Promise<void>((resolve, reject) => {
          this.db!.run(
            'INSERT INTO analysis (id, user_id, project_id, timestamp, brand, competitors, template_id, questions_count, configuration, results, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newId, user.id, newProjectId, analysis.timestamp, analysis.brand, analysis.competitors, analysis.template_id, analysis.questions_count, analysis.configuration, analysis.results, analysis.metadata, analysis.created_at],
            (err) => { if (err) reject(err); else resolve(); }
          );
        });
      }

      console.log(`Migración: Datos clonados para usuario ${user.id}`);
    }

    // Migrar configuraciones de archivo (carpeta global → cada usuario)
    const configsDir = path.join(process.cwd(), 'data', 'configurations');
    try {
      if (fs.existsSync(configsDir)) {
        const globalFiles = fs.readdirSync(configsDir).filter(f => f.endsWith('.json'));
        for (const user of users) {
          const userDir = path.join(configsDir, user.id);
          if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
          }
          for (const file of globalFiles) {
            const dest = path.join(userDir, file);
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(path.join(configsDir, file), dest);
            }
          }
        }
        // Eliminar configuraciones globales después de copiar
        for (const file of globalFiles) {
          fs.unlinkSync(path.join(configsDir, file));
        }
        console.log(`Migración: ${globalFiles.length} configuraciones copiadas a ${users.length} usuarios`);
      }
    } catch (err) {
      console.error('Migración: Error migrando configuraciones:', err);
    }

    // Eliminar datos huérfanos originales
    await new Promise<void>((resolve) => {
      this.db!.run('DELETE FROM analysis WHERE user_id IS NULL', () => {
        this.db!.run('DELETE FROM projects WHERE user_id IS NULL', () => resolve());
      });
    });

    // Marcar migración como ejecutada
    await new Promise<void>((resolve) => {
      this.db!.run("INSERT INTO migrations (name) VALUES ('orphan_data_to_all_users')", () => resolve());
    });

    console.log('Migración completada: datos huérfanos distribuidos a todos los usuarios');
  }

  // ==================== MÉTODOS DE PROYECTOS ====================

  async createProject(project: Omit<Project, 'createdAt' | 'updatedAt'>, userId?: string): Promise<Project> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const now = new Date().toISOString();
      const query = `
        INSERT INTO projects (id, user_id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const params = [project.id, userId || null, project.name, project.description || null, now, now];

      this.db.run(query, params, (err) => {
        if (err) {
          console.error('Error al crear proyecto:', err);
          reject(err);
        } else {
          console.log(`Proyecto creado con ID: ${project.id} para usuario: ${userId || 'global'}`);
          resolve({
            ...project,
            userId,
            createdAt: now,
            updatedAt: now
          });
        }
      });
    });
  }

  async getAllProjects(userId?: string): Promise<Project[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      let query: string;
      let params: any[];

      if (userId) {
        // Multi-tenant: solo proyectos del usuario
        query = 'SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC';
        params = [userId];
      } else {
        // Sin usuario: proyectos globales (user_id IS NULL)
        query = 'SELECT * FROM projects WHERE user_id IS NULL ORDER BY created_at DESC';
        params = [];
      }

      this.db.all(query, params, (err, rows: any[]) => {
        if (err) {
          console.error('Error al obtener proyectos:', err);
          reject(err);
        } else {
          const projects: Project[] = rows.map(row => ({
            id: row.id,
            userId: row.user_id || undefined,
            name: row.name,
            description: row.description,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          }));
          resolve(projects);
        }
      });
    });
  }

  async getProject(id: string, userId?: string): Promise<Project | null> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      let query: string;
      let params: any[];

      if (userId) {
        // Multi-tenant: verificar que pertenece al usuario
        query = 'SELECT * FROM projects WHERE id = ? AND user_id = ?';
        params = [id, userId];
      } else {
        query = 'SELECT * FROM projects WHERE id = ? AND user_id IS NULL';
        params = [id];
      }

      this.db.get(query, params, (err, row: any) => {
        if (err) {
          console.error('Error al obtener proyecto:', err);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve({
            id: row.id,
            userId: row.user_id || undefined,
            name: row.name,
            description: row.description,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          });
        }
      });
    });
  }

  async updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'description'>>, userId?: string): Promise<Project | null> {
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
        params.push(updates.name);
      }
      if (updates.description !== undefined) {
        fields.push('description = ?');
        params.push(updates.description);
      }

      params.push(id);

      let query: string;
      if (userId) {
        query = `UPDATE projects SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`;
        params.push(userId);
      } else {
        query = `UPDATE projects SET ${fields.join(', ')} WHERE id = ? AND user_id IS NULL`;
      }

      this.db.run(query, params, async (err) => {
        if (err) {
          console.error('Error al actualizar proyecto:', err);
          reject(err);
        } else {
          const updated = await this.getProject(id, userId);
          resolve(updated);
        }
      });
    });
  }

  async deleteProject(id: string, userId?: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      // Primero desvinculamos los análisis del proyecto
      let unlinkQuery: string;
      let unlinkParams: any[];

      if (userId) {
        unlinkQuery = 'UPDATE analysis SET project_id = NULL WHERE project_id = ? AND user_id = ?';
        unlinkParams = [id, userId];
      } else {
        unlinkQuery = 'UPDATE analysis SET project_id = NULL WHERE project_id = ? AND user_id IS NULL';
        unlinkParams = [id];
      }

      this.db.run(unlinkQuery, unlinkParams, (err) => {
        if (err) {
          console.error('Error al desvincular análisis:', err);
          reject(err);
          return;
        }

        // Luego eliminamos el proyecto
        let deleteQuery: string;
        let deleteParams: any[];

        if (userId) {
          deleteQuery = 'DELETE FROM projects WHERE id = ? AND user_id = ?';
          deleteParams = [id, userId];
        } else {
          deleteQuery = 'DELETE FROM projects WHERE id = ? AND user_id IS NULL';
          deleteParams = [id];
        }

        this.db?.run(deleteQuery, deleteParams, (err) => {
          if (err) {
            console.error('Error al eliminar proyecto:', err);
            reject(err);
          } else {
            console.log(`Proyecto eliminado con ID: ${id}`);
            resolve();
          }
        });
      });
    });
  }

  // ==================== MÉTODOS DE ANÁLISIS ====================

  async saveAnalysis(analysis: SavedAnalysis, userId?: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const {
        id,
        projectId,
        timestamp,
        configuration,
        results,
        metadata
      } = analysis;

      const query = `
        INSERT OR REPLACE INTO analysis (
          id, user_id, project_id, timestamp, brand, competitors, template_id, questions_count,
          configuration, results, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        id,
        userId || null,
        projectId || null,
        timestamp,
        configuration.brand,
        JSON.stringify(configuration.competitors),
        configuration.templateId,
        configuration.questionsCount,
        JSON.stringify(configuration),
        JSON.stringify(results),
        metadata ? JSON.stringify(metadata) : null
      ];

      this.db.run(query, params, function(err) {
        if (err) {
          console.error('Error al guardar análisis:', err);
          reject(err);
        } else {
          console.log(`Análisis guardado con ID: ${id} para usuario: ${userId || 'global'}`);
          resolve();
        }
      });
    });
  }

  async getAnalysis(id: string, userId?: string): Promise<SavedAnalysis | null> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      let query: string;
      let params: any[];

      if (userId) {
        query = 'SELECT * FROM analysis WHERE id = ? AND user_id = ?';
        params = [id, userId];
      } else {
        query = 'SELECT * FROM analysis WHERE id = ? AND user_id IS NULL';
        params = [id];
      }

      this.db.get(query, params, (err, row: any) => {
        if (err) {
          console.error('Error al recuperar análisis:', err);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          try {
            const analysis: SavedAnalysis = {
              id: row.id,
              userId: row.user_id || undefined,
              projectId: row.project_id || undefined,
              timestamp: row.timestamp,
              configuration: JSON.parse(row.configuration),
              results: JSON.parse(row.results),
              metadata: row.metadata ? JSON.parse(row.metadata) : undefined
            };
            resolve(analysis);
          } catch (parseErr) {
            console.error('Error al parsear datos del análisis:', parseErr);
            reject(parseErr);
          }
        }
      });
    });
  }

  async getAllAnalyses(limit: number = 50, projectId?: string, userId?: string): Promise<SavedAnalysis[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      let query: string;
      let params: any[];

      if (userId) {
        // Multi-tenant: solo análisis del usuario
        if (projectId) {
          query = `
            SELECT * FROM analysis
            WHERE user_id = ? AND project_id = ?
            ORDER BY created_at DESC
            LIMIT ?
          `;
          params = [userId, projectId, limit];
        } else {
          query = `
            SELECT * FROM analysis
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
          `;
          params = [userId, limit];
        }
      } else {
        // Sin usuario: análisis globales
        if (projectId) {
          query = `
            SELECT * FROM analysis
            WHERE user_id IS NULL AND project_id = ?
            ORDER BY created_at DESC
            LIMIT ?
          `;
          params = [projectId, limit];
        } else {
          query = `
            SELECT * FROM analysis
            WHERE user_id IS NULL
            ORDER BY created_at DESC
            LIMIT ?
          `;
          params = [limit];
        }
      }

      this.db.all(query, params, (err, rows: any[]) => {
        if (err) {
          console.error('Error al recuperar análisis:', err);
          reject(err);
        } else {
          try {
            const analyses: SavedAnalysis[] = rows.map(row => ({
              id: row.id,
              userId: row.user_id || undefined,
              projectId: row.project_id || undefined,
              timestamp: row.timestamp,
              configuration: JSON.parse(row.configuration),
              results: JSON.parse(row.results),
              metadata: row.metadata ? JSON.parse(row.metadata) : undefined
            }));
            resolve(analyses);
          } catch (parseErr) {
            console.error('Error al parsear datos de análisis:', parseErr);
            reject(parseErr);
          }
        }
      });
    });
  }

  async updateAnalysisProject(analysisId: string, projectId: string | null, userId?: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      let query: string;
      let params: any[];

      if (userId) {
        query = 'UPDATE analysis SET project_id = ? WHERE id = ? AND user_id = ?';
        params = [projectId, analysisId, userId];
      } else {
        query = 'UPDATE analysis SET project_id = ? WHERE id = ? AND user_id IS NULL';
        params = [projectId, analysisId];
      }

      this.db.run(query, params, (err) => {
        if (err) {
          console.error('Error al actualizar proyecto del análisis:', err);
          reject(err);
        } else {
          console.log(`Análisis ${analysisId} asignado al proyecto ${projectId}`);
          resolve();
        }
      });
    });
  }

  async deleteAnalysis(id: string, userId?: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      let query: string;
      let params: any[];

      if (userId) {
        query = 'DELETE FROM analysis WHERE id = ? AND user_id = ?';
        params = [id, userId];
      } else {
        query = 'DELETE FROM analysis WHERE id = ? AND user_id IS NULL';
        params = [id];
      }

      this.db.run(query, params, function(err) {
        if (err) {
          console.error('Error al eliminar análisis:', err);
          reject(err);
        } else {
          console.log(`Análisis eliminado con ID: ${id}`);
          resolve();
        }
      });
    });
  }

  async updateAnalysisConfiguration(id: string, configUpdates: any, userId?: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      // Primero obtenemos la configuración actual
      let selectQuery: string;
      let selectParams: any[];

      if (userId) {
        selectQuery = 'SELECT configuration FROM analysis WHERE id = ? AND user_id = ?';
        selectParams = [id, userId];
      } else {
        selectQuery = 'SELECT configuration FROM analysis WHERE id = ? AND user_id IS NULL';
        selectParams = [id];
      }

      this.db.get(selectQuery, selectParams, (err, row: any) => {
        if (err) {
          console.error('Error al obtener análisis:', err);
          reject(err);
          return;
        }

        if (!row) {
          reject(new Error('Análisis no encontrado'));
          return;
        }

        // Mezclamos la configuración actual con las actualizaciones
        const currentConfig = JSON.parse(row.configuration || '{}');
        const updatedConfig = { ...currentConfig, ...configUpdates };

        // Actualizamos en la base de datos
        let updateQuery: string;
        let updateParams: any[];

        if (userId) {
          updateQuery = 'UPDATE analysis SET configuration = ? WHERE id = ? AND user_id = ?';
          updateParams = [JSON.stringify(updatedConfig), id, userId];
        } else {
          updateQuery = 'UPDATE analysis SET configuration = ? WHERE id = ? AND user_id IS NULL';
          updateParams = [JSON.stringify(updatedConfig), id];
        }

        this.db!.run(updateQuery, updateParams, function(updateErr) {
          if (updateErr) {
            console.error('Error al actualizar configuración:', updateErr);
            reject(updateErr);
          } else {
            console.log(`Configuración de análisis ${id} actualizada`);
            resolve();
          }
        });
      });
    });
  }

  async getAnalysesByBrand(brand: string, userId?: string): Promise<SavedAnalysis[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      let query: string;
      let params: any[];

      if (userId) {
        query = `
          SELECT * FROM analysis
          WHERE brand = ? AND user_id = ?
          ORDER BY created_at DESC
        `;
        params = [brand, userId];
      } else {
        query = `
          SELECT * FROM analysis
          WHERE brand = ? AND user_id IS NULL
          ORDER BY created_at DESC
        `;
        params = [brand];
      }

      this.db.all(query, params, (err, rows: any[]) => {
        if (err) {
          console.error('Error al recuperar análisis por marca:', err);
          reject(err);
        } else {
          try {
            const analyses: SavedAnalysis[] = rows.map(row => ({
              id: row.id,
              userId: row.user_id || undefined,
              projectId: row.project_id || undefined,
              timestamp: row.timestamp,
              configuration: JSON.parse(row.configuration),
              results: JSON.parse(row.results),
              metadata: row.metadata ? JSON.parse(row.metadata) : undefined
            }));
            resolve(analyses);
          } catch (parseErr) {
            console.error('Error al parsear datos de análisis:', parseErr);
            reject(parseErr);
          }
        }
      });
    });
  }

  // ==================== MÉTODOS DE MIGRACIÓN ====================

  /**
   * Migrar datos existentes a un usuario específico (útil para migración inicial)
   */
  async migrateDataToUser(userId: string): Promise<{ projects: number; analyses: number }> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      let projectsUpdated = 0;
      let analysesUpdated = 0;

      this.db.serialize(() => {
        // Migrar proyectos sin usuario asignado
        this.db!.run(
          'UPDATE projects SET user_id = ? WHERE user_id IS NULL',
          [userId],
          function(err) {
            if (err) {
              console.error('Error migrando proyectos:', err);
            } else {
              projectsUpdated = this.changes;
            }
          }
        );

        // Migrar análisis sin usuario asignado
        this.db!.run(
          'UPDATE analysis SET user_id = ? WHERE user_id IS NULL',
          [userId],
          function(err) {
            if (err) {
              console.error('Error migrando análisis:', err);
              reject(err);
            } else {
              analysesUpdated = this.changes;
              console.log(`Migración completada: ${projectsUpdated} proyectos, ${analysesUpdated} análisis`);
              resolve({ projects: projectsUpdated, analyses: analysesUpdated });
            }
          }
        );
      });
    });
  }

  /**
   * Obtener estadísticas para un usuario
   */
  async getUserStats(userId: string): Promise<{ projectCount: number; analysisCount: number }> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      this.db.get(
        `SELECT
          (SELECT COUNT(*) FROM projects WHERE user_id = ?) as projectCount,
          (SELECT COUNT(*) FROM analysis WHERE user_id = ?) as analysisCount
        `,
        [userId, userId],
        (err, row: any) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              projectCount: row?.projectCount || 0,
              analysisCount: row?.analysisCount || 0
            });
          }
        }
      );
    });
  }

  close(): void {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error al cerrar la base de datos:', err);
        } else {
          console.log('Base de datos SQLite cerrada');
        }
      });
    }
  }

  // ============================================================
  // Admin import helpers (cross-user)
  // ============================================================

  async getAllProjectsAdmin(): Promise<Array<{ id: string; name: string; userId: string | null; description: string | null }>> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      this.db.all(
        'SELECT id, name, description, user_id FROM projects ORDER BY name ASC',
        (err, rows: any[]) => {
          if (err) return reject(err);
          resolve(rows.map(r => ({ id: r.id, name: r.name, description: r.description, userId: r.user_id })));
        }
      );
    });
  }

  async bulkImportAnalyses(
    rows: Array<{
      id: string;
      user_id: string | null;
      project_id: string | null;
      timestamp: string;
      brand: string;
      competitors: string;
      template_id: string | null;
      questions_count: number | null;
      configuration: string;
      results: string;
      metadata: string | null;
      created_at?: string | null;
    }>
  ): Promise<{ inserted: number; skipped: number }> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('DB not initialized');
    const db = this.db;

    let inserted = 0;
    let skipped = 0;

    for (const r of rows) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT OR IGNORE INTO analysis
            (id, user_id, project_id, timestamp, brand, competitors, template_id,
             questions_count, configuration, results, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
          [
            r.id, r.user_id, r.project_id, r.timestamp, r.brand, r.competitors,
            r.template_id, r.questions_count, r.configuration, r.results, r.metadata,
            r.created_at ?? null,
          ],
          function (err) {
            if (err) return reject(err);
            if (this.changes > 0) inserted++; else skipped++;
            resolve();
          }
        );
      });
    }

    return { inserted, skipped };
  }

  async bulkImportAiOverviews(
    rows: Array<{
      id: string;
      user_id: string | null;
      project_id: string | null;
      timestamp: string;
      target_domain: string;
      competitors: string;
      location_code: number | null;
      language_code: string | null;
      country_code: string | null;
      configuration: string;
      results: string;
      cost_usd: number | null;
      status: string | null;
      created_at?: string | null;
    }>
  ): Promise<{ inserted: number; skipped: number }> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('DB not initialized');
    const db = this.db;

    let inserted = 0;
    let skipped = 0;

    for (const r of rows) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT OR IGNORE INTO ai_overview_analyses
            (id, user_id, project_id, timestamp, target_domain, competitors,
             location_code, language_code, country_code, configuration, results,
             cost_usd, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
          [
            r.id, r.user_id, r.project_id, r.timestamp, r.target_domain, r.competitors,
            r.location_code, r.language_code, r.country_code, r.configuration, r.results,
            r.cost_usd, r.status, r.created_at ?? null,
          ],
          function (err) {
            if (err) return reject(err);
            if (this.changes > 0) inserted++; else skipped++;
            resolve();
          }
        );
      });
    }

    return { inserted, skipped };
  }

  // ==================== SCHEDULED REPORTS ====================

  private rowToScheduledReport(row: any): ScheduledReport {
    return {
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      name: row.name,
      type: row.type as ScheduledReportType,
      configurationId: row.configuration_id ?? null,
      payload: row.payload ? JSON.parse(row.payload) : {},
      frequency: row.frequency as ScheduledReportFrequency,
      hour: row.hour,
      weekday: row.weekday ?? null,
      dayOfMonth: row.day_of_month ?? null,
      timezone: row.timezone,
      enabled: !!row.enabled,
      nextRunAt: row.next_run_at ?? null,
      lastRunAt: row.last_run_at ?? null,
      lastStatus: (row.last_status ?? null) as ScheduledReportStatus | null,
      lastError: row.last_error ?? null,
      lastAnalysisId: row.last_analysis_id ?? null,
      errorsAcknowledgedAt: row.errors_acknowledged_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createScheduledReport(input: CreateScheduledReportInput): Promise<ScheduledReport> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('DB no inicializada');
    const db = this.db;

    const id = uuidv4();
    const now = Date.now();
    const enabled = input.enabled ?? true;
    const timezone = input.timezone ?? 'Europe/Madrid';

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO scheduled_reports
          (id, user_id, project_id, name, type, configuration_id, payload,
           frequency, hour, weekday, day_of_month, timezone, enabled,
           next_run_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.userId,
          input.projectId,
          input.name,
          input.type,
          input.configurationId ?? null,
          JSON.stringify(input.payload),
          input.frequency,
          input.hour,
          input.weekday ?? null,
          input.dayOfMonth ?? null,
          timezone,
          enabled ? 1 : 0,
          input.nextRunAt,
          now,
          now,
        ],
        (err) => (err ? reject(err) : resolve())
      );
    });

    const created = await this.getScheduledReport(id, input.userId);
    if (!created) throw new Error('No se pudo recuperar el schedule recién creado');
    return created;
  }

  async getScheduledReport(id: string, userId: string): Promise<ScheduledReport | null> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('DB no inicializada');
    const db = this.db;

    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM scheduled_reports WHERE id = ? AND user_id = ?',
        [id, userId],
        (err, row: any) => {
          if (err) return reject(err);
          resolve(row ? this.rowToScheduledReport(row) : null);
        }
      );
    });
  }

  async listScheduledReports(userId: string, projectId?: string): Promise<ScheduledReport[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('DB no inicializada');
    const db = this.db;

    const query = projectId
      ? 'SELECT * FROM scheduled_reports WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC'
      : 'SELECT * FROM scheduled_reports WHERE user_id = ? ORDER BY created_at DESC';
    const params = projectId ? [userId, projectId] : [userId];

    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows: any[]) => {
        if (err) return reject(err);
        resolve((rows || []).map(r => this.rowToScheduledReport(r)));
      });
    });
  }

  async listDueScheduledReports(nowMs: number): Promise<ScheduledReport[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('DB no inicializada');
    const db = this.db;

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM scheduled_reports
         WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
         ORDER BY next_run_at ASC`,
        [nowMs],
        (err, rows: any[]) => {
          if (err) return reject(err);
          resolve((rows || []).map(r => this.rowToScheduledReport(r)));
        }
      );
    });
  }

  async updateScheduledReport(
    id: string,
    userId: string,
    updates: UpdateScheduledReportInput
  ): Promise<ScheduledReport | null> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('DB no inicializada');
    const db = this.db;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.payload !== undefined) { fields.push('payload = ?'); values.push(JSON.stringify(updates.payload)); }
    if (updates.configurationId !== undefined) { fields.push('configuration_id = ?'); values.push(updates.configurationId); }
    if (updates.frequency !== undefined) { fields.push('frequency = ?'); values.push(updates.frequency); }
    if (updates.hour !== undefined) { fields.push('hour = ?'); values.push(updates.hour); }
    if (updates.weekday !== undefined) { fields.push('weekday = ?'); values.push(updates.weekday); }
    if (updates.dayOfMonth !== undefined) { fields.push('day_of_month = ?'); values.push(updates.dayOfMonth); }
    if (updates.timezone !== undefined) { fields.push('timezone = ?'); values.push(updates.timezone); }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }
    if (updates.nextRunAt !== undefined) { fields.push('next_run_at = ?'); values.push(updates.nextRunAt); }

    if (fields.length === 0) {
      return this.getScheduledReport(id, userId);
    }

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id, userId);

    await new Promise<void>((resolve, reject) => {
      db.run(
        `UPDATE scheduled_reports SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
        values,
        (err) => (err ? reject(err) : resolve())
      );
    });

    return this.getScheduledReport(id, userId);
  }

  async markScheduledReportRunning(id: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('DB no inicializada');
    const db = this.db;

    await new Promise<void>((resolve, reject) => {
      db.run(
        `UPDATE scheduled_reports SET last_status = 'running', updated_at = ? WHERE id = ?`,
        [Date.now(), id],
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  async recordScheduledReportResult(
    id: string,
    result: {
      status: ScheduledReportStatus;
      error?: string | null;
      lastAnalysisId?: string | null;
      nextRunAt: number | null;
    }
  ): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('DB no inicializada');
    const db = this.db;

    const now = Date.now();
    await new Promise<void>((resolve, reject) => {
      db.run(
        `UPDATE scheduled_reports SET
          last_status = ?,
          last_error = ?,
          last_analysis_id = ?,
          last_run_at = ?,
          next_run_at = ?,
          updated_at = ?
         WHERE id = ?`,
        [
          result.status,
          result.error ?? null,
          result.lastAnalysisId ?? null,
          now,
          result.nextRunAt,
          now,
          id,
        ],
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  /**
   * Marca como 'error' los schedules que quedaron en 'running' (interrumpidos
   * por reinicio del servidor). Idempotente: solo afecta a filas con last_status='running'.
   * Devuelve el nº de filas afectadas.
   */
  async resetStuckRunningSchedules(): Promise<number> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('DB no inicializada');
    const db = this.db;
    const now = Date.now();

    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE scheduled_reports
         SET last_status = 'error',
             last_error = 'Ejecución interrumpida por reinicio del servidor. Se reintentará en la próxima ventana programada.',
             last_run_at = COALESCE(last_run_at, ?),
             updated_at = ?
         WHERE last_status = 'running'`,
        [now, now],
        function (err) {
          if (err) return reject(err);
          resolve(this.changes);
        }
      );
    });
  }

  /**
   * Devuelve el nº de schedules del usuario con error sin acknowledge
   * (error posterior al último ack, o nunca ack).
   */
  async countUnacknowledgedScheduleErrors(userId: string): Promise<{ count: number; latest: ScheduledReport | null }> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('DB no inicializada');
    const db = this.db;

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM scheduled_reports
         WHERE user_id = ?
           AND last_status = 'error'
           AND (errors_acknowledged_at IS NULL OR (last_run_at IS NOT NULL AND last_run_at > errors_acknowledged_at))
         ORDER BY last_run_at DESC`,
        [userId],
        (err, rows: any[]) => {
          if (err) return reject(err);
          const mapped = (rows || []).map(r => this.rowToScheduledReport(r));
          resolve({ count: mapped.length, latest: mapped[0] || null });
        }
      );
    });
  }

  /**
   * Marca todos los errores actuales del usuario como "vistos".
   * Devuelve nº de schedules afectados.
   */
  async acknowledgeScheduleErrors(userId: string): Promise<number> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('DB no inicializada');
    const db = this.db;
    const now = Date.now();

    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE scheduled_reports
         SET errors_acknowledged_at = ?, updated_at = ?
         WHERE user_id = ? AND last_status = 'error'`,
        [now, now, userId],
        function (err) {
          if (err) return reject(err);
          resolve(this.changes);
        }
      );
    });
  }

  async deleteScheduledReport(id: string, userId: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('DB no inicializada');
    const db = this.db;

    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM scheduled_reports WHERE id = ? AND user_id = ?',
        [id, userId],
        function (err) {
          if (err) return reject(err);
          resolve(this.changes > 0);
        }
      );
    });
  }
}

export const databaseService = new DatabaseService();
