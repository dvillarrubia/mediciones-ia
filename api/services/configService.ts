/**
 * Servicio para gestión de configuraciones personalizadas
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PREDEFINED_TEMPLATES, type AnalysisTemplate, type CustomConfiguration } from '../config/templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio para almacenar configuraciones personalizadas
const CONFIGS_DIR = path.join(__dirname, '..', 'data', 'configurations');

class ConfigService {
  constructor() {
    this.ensureConfigsDirectory();
  }

  /**
   * Asegurar que el directorio de configuraciones existe
   */
  private async ensureConfigsDirectory(): Promise<void> {
    try {
      await fs.access(CONFIGS_DIR);
    } catch {
      await fs.mkdir(CONFIGS_DIR, { recursive: true });
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
   * Obtener todas las configuraciones personalizadas
   */
  async getCustomConfigurations(): Promise<CustomConfiguration[]> {
    try {
      const files = await fs.readdir(CONFIGS_DIR);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      const configurations: CustomConfiguration[] = [];
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(CONFIGS_DIR, file);
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
  async getCustomConfiguration(id: string): Promise<CustomConfiguration | null> {
    try {
      const filePath = path.join(CONFIGS_DIR, `${id}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as CustomConfiguration;
    } catch (error) {
      return null;
    }
  }

  /**
   * Crear una nueva configuración personalizada
   */
  async createCustomConfiguration(config: Omit<CustomConfiguration, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomConfiguration> {
    const id = this.generateId();
    const now = new Date().toISOString();
    
    const newConfig: CustomConfiguration = {
      ...config,
      id,
      createdAt: now,
      updatedAt: now
    };

    await this.validateConfiguration(newConfig);
    
    const filePath = path.join(CONFIGS_DIR, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(newConfig, null, 2), 'utf-8');
    
    return newConfig;
  }

  /**
   * Actualizar una configuración personalizada existente
   */
  async updateCustomConfiguration(id: string, updates: Partial<Omit<CustomConfiguration, 'id' | 'createdAt'>>): Promise<CustomConfiguration | null> {
    const existing = await this.getCustomConfiguration(id);
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
    
    const filePath = path.join(CONFIGS_DIR, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(updatedConfig, null, 2), 'utf-8');
    
    return updatedConfig;
  }

  /**
   * Eliminar una configuración personalizada
   */
  async deleteCustomConfiguration(id: string): Promise<boolean> {
    try {
      const filePath = path.join(CONFIGS_DIR, `${id}.json`);
      await fs.unlink(filePath);
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

    // Validar fuentes prioritarias
    if (!config.prioritySources || config.prioritySources.length === 0) {
      errors.push('Al menos una fuente prioritaria es requerida');
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
  async getConfiguration(type: 'template' | 'custom', id: string): Promise<AnalysisTemplate | CustomConfiguration | null> {
    if (type === 'template') {
      return this.getPredefinedTemplate(id);
    } else {
      return this.getCustomConfiguration(id);
    }
  }

  /**
   * Duplicar una configuración (crear copia personalizada de una plantilla)
   */
  async duplicateConfiguration(sourceType: 'template' | 'custom', sourceId: string, newName: string): Promise<CustomConfiguration | null> {
    const sourceConfig = await this.getConfiguration(sourceType, sourceId);
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

    return this.createCustomConfiguration(newConfig);
  }
}

export default ConfigService;