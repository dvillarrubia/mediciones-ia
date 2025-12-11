/**
 * Servicio para gestión de configuraciones personalizadas
 * Soporta multi-tenant: cada usuario tiene sus propias configuraciones
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PREDEFINED_TEMPLATES, type AnalysisTemplate, type CustomConfiguration } from '../config/templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio base para configuraciones
const CONFIGS_BASE_DIR = path.join(__dirname, '..', 'data', 'configurations');

class ConfigService {
  constructor() {
    this.ensureConfigsDirectory();
  }

  /**
   * Obtener directorio de configuraciones para un usuario
   * Si no hay userId, usa el directorio global
   */
  private getConfigsDir(userId?: string): string {
    if (userId) {
      return path.join(CONFIGS_BASE_DIR, userId);
    }
    return CONFIGS_BASE_DIR;
  }

  /**
   * Asegurar que el directorio de configuraciones existe
   */
  private async ensureConfigsDirectory(userId?: string): Promise<void> {
    const dir = this.getConfigsDir(userId);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Obtener todas las plantillas predefinidas
   */
  getPredefinedTemplates(): AnalysisTemplate[] {
    return PREDEFINED_TEMPLATES;
  }

  /**
   * Obtener una plantilla predefinida por ID
   */
  getPredefinedTemplate(id: string): AnalysisTemplate | null {
    return PREDEFINED_TEMPLATES.find(template => template.id === id) || null;
  }

  /**
   * Obtener todas las configuraciones personalizadas de un usuario
   */
  async getCustomConfigurations(userId?: string): Promise<CustomConfiguration[]> {
    await this.ensureConfigsDirectory(userId);
    const configsDir = this.getConfigsDir(userId);

    try {
      const files = await fs.readdir(configsDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      const configurations: CustomConfiguration[] = [];

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(configsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const config = JSON.parse(content) as CustomConfiguration;
          configurations.push(config);
        } catch (error) {
          console.error(`Error loading configuration ${file}:`, error);
        }
      }

      return configurations.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      console.error('Error reading configurations directory:', error);
      return [];
    }
  }

  /**
   * Obtener una configuración personalizada por ID
   */
  async getCustomConfiguration(id: string, userId?: string): Promise<CustomConfiguration | null> {
    await this.ensureConfigsDirectory(userId);
    const configsDir = this.getConfigsDir(userId);

    try {
      // Buscar el archivo que contenga el ID
      const files = await fs.readdir(configsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(configsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const config = JSON.parse(content) as CustomConfiguration;
          if (config.id === id) {
            return config;
          }
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Crear una nueva configuración personalizada
   */
  async createCustomConfiguration(
    config: Omit<CustomConfiguration, 'id' | 'createdAt' | 'updatedAt'>,
    userId?: string
  ): Promise<CustomConfiguration> {
    await this.ensureConfigsDirectory(userId);
    const configsDir = this.getConfigsDir(userId);

    const id = this.generateId();
    const now = new Date().toISOString();

    const newConfig: CustomConfiguration = {
      ...config,
      id,
      createdAt: now,
      updatedAt: now
    };

    await this.validateConfiguration(newConfig);

    const filePath = path.join(configsDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(newConfig, null, 2), 'utf-8');

    console.log(`Configuración creada: ${id} para usuario: ${userId || 'global'}`);
    return newConfig;
  }

  /**
   * Actualizar una configuración personalizada existente
   */
  async updateCustomConfiguration(
    id: string,
    updates: Partial<Omit<CustomConfiguration, 'id' | 'createdAt'>>,
    userId?: string
  ): Promise<CustomConfiguration | null> {
    await this.ensureConfigsDirectory(userId);
    const configsDir = this.getConfigsDir(userId);

    const existing = await this.getCustomConfiguration(id, userId);
    if (!existing) {
      return null;
    }

    const updatedConfig: CustomConfiguration = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };

    await this.validateConfiguration(updatedConfig);

    const filePath = path.join(configsDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(updatedConfig, null, 2), 'utf-8');

    return updatedConfig;
  }

  /**
   * Eliminar una configuración personalizada
   */
  async deleteCustomConfiguration(id: string, userId?: string): Promise<boolean> {
    await this.ensureConfigsDirectory(userId);
    const configsDir = this.getConfigsDir(userId);

    try {
      const filePath = path.join(configsDir, `${id}.json`);
      await fs.unlink(filePath);
      console.log(`Configuración eliminada: ${id} para usuario: ${userId || 'global'}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validar una configuración
   */
  async validateConfiguration(config: CustomConfiguration): Promise<void> {
    const errors: string[] = [];

    // Validar nombre
    if (!config.name || config.name.trim().length === 0) {
      errors.push('El nombre es requerido');
    }

    // Validar marca objetivo
    if (!config.targetBrand || config.targetBrand.trim().length === 0) {
      errors.push('La marca objetivo es requerida');
    }

    // Validar competidores
    if (!config.competitorBrands || config.competitorBrands.length === 0) {
      errors.push('Al menos un competidor es requerido');
    }

    // Validar preguntas
    if (!config.questions || config.questions.length === 0) {
      errors.push('Al menos una pregunta es requerida');
    } else {
      config.questions.forEach((question, index) => {
        if (!question.id || question.id.trim().length === 0) {
          errors.push(`Pregunta ${index + 1}: ID es requerido`);
        }
        if (!question.question || question.question.trim().length === 0) {
          errors.push(`Pregunta ${index + 1}: Texto es requerido`);
        }
        if (!question.category || question.category.trim().length === 0) {
          errors.push(`Pregunta ${index + 1}: Categoría es requerida`);
        }
      });
    }

    if (errors.length > 0) {
      throw new Error(`Errores de validación: ${errors.join(', ')}`);
    }
  }

  /**
   * Generar un ID único
   */
  private generateId(): string {
    return `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Obtener configuración por tipo (plantilla predefinida o personalizada)
   */
  async getConfiguration(
    type: 'template' | 'custom',
    id: string,
    userId?: string
  ): Promise<AnalysisTemplate | CustomConfiguration | null> {
    if (type === 'template') {
      return this.getPredefinedTemplate(id);
    } else {
      return this.getCustomConfiguration(id, userId);
    }
  }

  /**
   * Duplicar una configuración (crear copia personalizada de una plantilla)
   */
  async duplicateConfiguration(
    sourceType: 'template' | 'custom',
    sourceId: string,
    newName: string,
    userId?: string
  ): Promise<CustomConfiguration | null> {
    const sourceConfig = await this.getConfiguration(sourceType, sourceId, userId);
    if (!sourceConfig) {
      return null;
    }

    // Determinar la marca objetivo
    let targetBrand = '';
    if ('targetBrand' in sourceConfig && sourceConfig.targetBrand) {
      targetBrand = sourceConfig.targetBrand;
    } else if ('targetBrands' in sourceConfig && sourceConfig.targetBrands && sourceConfig.targetBrands.length > 0) {
      targetBrand = sourceConfig.targetBrands[0];
    }

    const newConfig = {
      name: newName,
      description: `Copia de ${sourceConfig.name}`,
      templateId: sourceType === 'template' ? sourceId : undefined,
      targetBrand,
      competitorBrands: [...(sourceConfig.competitorBrands || [])],
      questions: sourceConfig.questions.map(q => ({ ...q })),
      prioritySources: [...sourceConfig.prioritySources]
    };

    return this.createCustomConfiguration(newConfig, userId);
  }

  /**
   * Migrar configuraciones globales a un usuario
   */
  async migrateConfigurationsToUser(userId: string): Promise<number> {
    await this.ensureConfigsDirectory(userId);

    const globalConfigs = await this.getCustomConfigurations();
    const userConfigsDir = this.getConfigsDir(userId);
    let migrated = 0;

    for (const config of globalConfigs) {
      try {
        const filePath = path.join(userConfigsDir, `${config.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
        migrated++;
      } catch (error) {
        console.error(`Error migrando configuración ${config.id}:`, error);
      }
    }

    console.log(`Migradas ${migrated} configuraciones al usuario ${userId}`);
    return migrated;
  }

  /**
   * Obtener estadísticas de configuraciones para un usuario
   */
  async getConfigurationStats(userId?: string): Promise<{ customCount: number; templateCount: number }> {
    const customConfigs = await this.getCustomConfigurations(userId);
    return {
      customCount: customConfigs.length,
      templateCount: PREDEFINED_TEMPLATES.length
    };
  }
}

export default ConfigService;
