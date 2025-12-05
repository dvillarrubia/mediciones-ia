import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import { AnalysisResult } from './openaiService';
import path from 'path';
import fs from 'fs';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedAnalysis {
  id: string;
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

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'analysis.db');
    this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    // Crear directorio data si no existe
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('Error al abrir la base de datos:', err);
        return;
      }
      console.log('Base de datos SQLite conectada');
      this.createTables();
    });
  }

  private createTables(): void {
    // Tabla de proyectos
    const createProjectsTable = `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Tabla de análisis con project_id
    const createAnalysisTable = `
      CREATE TABLE IF NOT EXISTS analysis (
        id TEXT PRIMARY KEY,
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
        FOREIGN KEY (project_id) REFERENCES projects(id)
      )
    `;

    // Agregar columna project_id si no existe (para migración)
    const addProjectIdColumn = `
      ALTER TABLE analysis ADD COLUMN project_id TEXT REFERENCES projects(id)
    `;

    this.db?.run(createProjectsTable, (err) => {
      if (err) {
        console.error('Error al crear tabla de proyectos:', err);
      } else {
        console.log('Tabla de proyectos creada/verificada');
      }
    });

    this.db?.run(createAnalysisTable, (err) => {
      if (err) {
        console.error('Error al crear la tabla de análisis:', err);
      } else {
        console.log('Tabla de análisis creada/verificada');
      }
    });

    // Intentar agregar la columna project_id (ignorar error si ya existe)
    this.db?.run(addProjectIdColumn, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        // Solo loguear si no es error de columna duplicada
        if (!err.message.includes('duplicate')) {
          console.log('Columna project_id ya existe o error:', err.message);
        }
      }
    });
  }

  // ==================== MÉTODOS DE PROYECTOS ====================

  async createProject(project: Omit<Project, 'createdAt' | 'updatedAt'>): Promise<Project> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const now = new Date().toISOString();
      const query = `
        INSERT INTO projects (id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `;

      const params = [project.id, project.name, project.description || null, now, now];

      this.db.run(query, params, (err) => {
        if (err) {
          console.error('Error al crear proyecto:', err);
          reject(err);
        } else {
          console.log(`Proyecto creado con ID: ${project.id}`);
          resolve({
            ...project,
            createdAt: now,
            updatedAt: now
          });
        }
      });
    });
  }

  async getAllProjects(): Promise<Project[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const query = 'SELECT * FROM projects ORDER BY created_at DESC';

      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          console.error('Error al obtener proyectos:', err);
          reject(err);
        } else {
          const projects: Project[] = rows.map(row => ({
            id: row.id,
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

  async getProject(id: string): Promise<Project | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const query = 'SELECT * FROM projects WHERE id = ?';

      this.db.get(query, [id], (err, row: any) => {
        if (err) {
          console.error('Error al obtener proyecto:', err);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve({
            id: row.id,
            name: row.name,
            description: row.description,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          });
        }
      });
    });
  }

  async updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'description'>>): Promise<Project | null> {
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

      const query = `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`;

      this.db.run(query, params, async (err) => {
        if (err) {
          console.error('Error al actualizar proyecto:', err);
          reject(err);
        } else {
          const updated = await this.getProject(id);
          resolve(updated);
        }
      });
    });
  }

  async deleteProject(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      // Primero desvinculamos los análisis del proyecto
      const unlinkQuery = 'UPDATE analysis SET project_id = NULL WHERE project_id = ?';

      this.db.run(unlinkQuery, [id], (err) => {
        if (err) {
          console.error('Error al desvincular análisis:', err);
          reject(err);
          return;
        }

        // Luego eliminamos el proyecto
        const deleteQuery = 'DELETE FROM projects WHERE id = ?';

        this.db?.run(deleteQuery, [id], (err) => {
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

  async saveAnalysis(analysis: SavedAnalysis): Promise<void> {
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
          id, project_id, timestamp, brand, competitors, template_id, questions_count,
          configuration, results, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        id,
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
          console.log(`Análisis guardado con ID: ${id}`);
          resolve();
        }
      });
    });
  }

  async getAnalysis(id: string): Promise<SavedAnalysis | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const query = 'SELECT * FROM analysis WHERE id = ?';

      this.db.get(query, [id], (err, row: any) => {
        if (err) {
          console.error('Error al recuperar análisis:', err);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          try {
            const analysis: SavedAnalysis = {
              id: row.id,
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

  async getAllAnalyses(limit: number = 50, projectId?: string): Promise<SavedAnalysis[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      let query: string;
      let params: any[];

      if (projectId) {
        query = `
          SELECT * FROM analysis
          WHERE project_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `;
        params = [projectId, limit];
      } else {
        query = `
          SELECT * FROM analysis
          ORDER BY created_at DESC
          LIMIT ?
        `;
        params = [limit];
      }

      this.db.all(query, params, (err, rows: any[]) => {
        if (err) {
          console.error('Error al recuperar análisis:', err);
          reject(err);
        } else {
          try {
            const analyses: SavedAnalysis[] = rows.map(row => ({
              id: row.id,
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

  async updateAnalysisProject(analysisId: string, projectId: string | null): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const query = 'UPDATE analysis SET project_id = ? WHERE id = ?';

      this.db.run(query, [projectId, analysisId], (err) => {
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

  async deleteAnalysis(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const query = 'DELETE FROM analysis WHERE id = ?';
      
      this.db.run(query, [id], function(err) {
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

  async updateAnalysisConfiguration(id: string, configUpdates: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      // Primero obtenemos la configuración actual
      const selectQuery = 'SELECT configuration FROM analysis WHERE id = ?';

      this.db.get(selectQuery, [id], (err, row: any) => {
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
        const updateQuery = 'UPDATE analysis SET configuration = ? WHERE id = ?';

        this.db.run(updateQuery, [JSON.stringify(updatedConfig), id], function(updateErr) {
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

  async getAnalysesByBrand(brand: string): Promise<SavedAnalysis[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de datos no inicializada'));
        return;
      }

      const query = `
        SELECT * FROM analysis 
        WHERE brand = ? 
        ORDER BY created_at DESC
      `;

      this.db.all(query, [brand], (err, rows: any[]) => {
        if (err) {
          console.error('Error al recuperar análisis por marca:', err);
          reject(err);
        } else {
          try {
            const analyses: SavedAnalysis[] = rows.map(row => ({
              id: row.id,
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