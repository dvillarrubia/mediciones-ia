import { Router, Request, Response } from 'express';
import ConfigService from '../services/configService.js';
import { 
  PREDEFINED_TEMPLATES, 
  COMMON_SOURCES, 
  AnalysisTemplate, 
  CustomConfiguration,
  AnalysisQuestion 
} from '../config/templates.js';

const router = Router();
const configService = new ConfigService();

/**
 * GET /api/templates
 * Obtener todas las plantillas predefinidas
 */
router.get('/', (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        templates: PREDEFINED_TEMPLATES,
        commonSources: COMMON_SOURCES
      }
    });
  } catch (error) {
    console.error('Error al obtener plantillas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * GET /api/templates/predefined
 * Obtener todas las plantillas predefinidas (alias)
 */
router.get('/predefined', (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: PREDEFINED_TEMPLATES
    });
  } catch (error) {
    console.error('Error al obtener plantillas predefinidas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * GET /api/templates/:id
 * Obtener una plantilla específica por ID
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const template = PREDEFINED_TEMPLATES.find(t => t.id === id);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Plantilla no encontrada'
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Error al obtener plantilla:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * GET /api/templates/configurations
 * Obtener todas las configuraciones personalizadas
 */
router.get('/configurations/all', async (req: Request, res: Response) => {
  try {
    const configurations = await configService.getCustomConfigurations();
    res.json({
      success: true,
      data: configurations
    });
  } catch (error) {
    console.error('Error al obtener configuraciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * GET /api/templates/configurations/:id
 * Obtener una configuración personalizada específica
 */
router.get('/configurations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const configuration = await configService.getCustomConfiguration(id);
    
    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    res.json({
      success: true,
      data: configuration
    });
  } catch (error) {
    console.error('Error al obtener configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * POST /api/templates/configurations
 * Crear una nueva configuración personalizada
 */
router.post('/configurations', async (req: Request, res: Response) => {
  try {
    const {
      name,
      templateId,
      targetBrand,
      competitorBrands,
      prioritySources,
      questions
    } = req.body;

    // Validaciones básicas
    if (!name || !targetBrand || !competitorBrands || !prioritySources || !questions) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos'
      });
    }

    if (!Array.isArray(competitorBrands) || !Array.isArray(prioritySources) || !Array.isArray(questions)) {
      return res.status(400).json({
        success: false,
        error: 'Los campos competitorBrands, prioritySources y questions deben ser arrays'
      });
    }

    // Validar estructura de preguntas
    const validQuestions = questions.every((q: any) => 
      q && typeof q.id === 'string' && typeof q.question === 'string' && typeof q.category === 'string'
    );

    if (!validQuestions) {
      return res.status(400).json({
        success: false,
        error: 'Las preguntas deben tener id, question y category'
      });
    }

    const newConfiguration = await configService.createCustomConfiguration({
      name,
      templateId,
      targetBrand,
      competitorBrands,
      prioritySources,
      questions
    });

    res.status(201).json({
      success: true,
      data: newConfiguration
    });
  } catch (error) {
    console.error('Error al crear configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * PUT /api/templates/configurations/:id
 * Actualizar una configuración personalizada
 */
router.put('/configurations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedConfiguration = await configService.updateCustomConfiguration(id, updates);
    
    if (!updatedConfiguration) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    res.json({
      success: true,
      data: updatedConfiguration
    });
  } catch (error) {
    console.error('Error al actualizar configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * DELETE /api/templates/configurations/:id
 * Eliminar una configuración personalizada
 */
router.delete('/configurations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await configService.deleteCustomConfiguration(id);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Configuración eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * POST /api/templates/duplicate
 * Duplicar una plantilla o configuración personalizada
 */
router.post('/duplicate', async (req: Request, res: Response) => {
  try {
    const { sourceType, sourceId, newName } = req.body;

    if (!sourceType || !sourceId || !newName) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren sourceType, sourceId y newName'
      });
    }

    const duplicatedConfiguration = await configService.duplicateConfiguration(sourceType, sourceId, newName);
    
    if (!duplicatedConfiguration) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    res.status(201).json({
      success: true,
      data: duplicatedConfiguration
    });
  } catch (error) {
    console.error('Error al duplicar configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * POST /api/templates/custom
 * Crear una nueva configuración personalizada
 */
router.post('/custom', async (req: Request, res: Response) => {
  try {
    const configData = req.body;

    if (!configData.name || !configData.targetBrand || !configData.competitorBrands?.length || !configData.questions?.length) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: name, targetBrand, competitorBrands, questions'
      });
    }

    const newConfiguration = await configService.createCustomConfiguration(configData);

    res.status(201).json({
      success: true,
      data: newConfiguration
    });
  } catch (error) {
    console.error('Error al crear configuración personalizada:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor'
    });
  }
});

/**
 * PUT /api/templates/custom/:id
 * Actualizar una configuración personalizada
 */
router.put('/custom/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedConfiguration = await configService.updateCustomConfiguration(id, updates);

    if (!updatedConfiguration) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    res.json({
      success: true,
      data: updatedConfiguration
    });
  } catch (error) {
    console.error('Error al actualizar configuración:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor'
    });
  }
});

/**
 * DELETE /api/templates/custom/:id
 * Eliminar una configuración personalizada
 */
router.delete('/custom/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await configService.deleteCustomConfiguration(id);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Configuración eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

export default router;