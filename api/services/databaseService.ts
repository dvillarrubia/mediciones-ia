import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import { AnalysisResult } from './openaiService';
import path from 'path';
import fs from 'fs';

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

        // Crear índices para optimización multi-tenant
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)');
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_analysis_user_id ON analysis(user_id)');
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_analysis_project_id ON analysis(project_id)', () => {
          console.log('DatabaseService: Índices multi-tenant creados/verificados');
          resolve();
        });
      });
    });
  }

  private async ensureInitialized(): Promise<void> {
    await this.initialized;
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
}

export const databaseService = new DatabaseService();
