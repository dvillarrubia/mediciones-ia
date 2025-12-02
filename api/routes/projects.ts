/**
 * Rutas para gestión de proyectos
 */
import { Router, Request, Response } from 'express';
import { databaseService } from '../services/databaseService.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * GET /api/projects
 * Obtener todos los proyectos
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const projects = await databaseService.getAllProjects();
    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('Error al obtener proyectos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener proyectos'
    });
  }
});

/**
 * GET /api/projects/:id
 * Obtener un proyecto por ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const project = await databaseService.getProject(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Proyecto no encontrado'
      });
    }

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error al obtener proyecto:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener proyecto'
    });
  }
});

/**
 * POST /api/projects
 * Crear un nuevo proyecto
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'El nombre del proyecto es requerido'
      });
    }

    const project = await databaseService.createProject({
      id: uuidv4(),
      name: name.trim(),
      description: description?.trim() || undefined
    });

    res.status(201).json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error al crear proyecto:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear proyecto'
    });
  }
});

/**
 * PUT /api/projects/:id
 * Actualizar un proyecto
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const existingProject = await databaseService.getProject(id);
    if (!existingProject) {
      return res.status(404).json({
        success: false,
        error: 'Proyecto no encontrado'
      });
    }

    const updates: { name?: string; description?: string } = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || undefined;

    const updatedProject = await databaseService.updateProject(id, updates);

    res.json({
      success: true,
      data: updatedProject
    });
  } catch (error) {
    console.error('Error al actualizar proyecto:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar proyecto'
    });
  }
});

/**
 * DELETE /api/projects/:id
 * Eliminar un proyecto
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existingProject = await databaseService.getProject(id);
    if (!existingProject) {
      return res.status(404).json({
        success: false,
        error: 'Proyecto no encontrado'
      });
    }

    await databaseService.deleteProject(id);

    res.json({
      success: true,
      message: 'Proyecto eliminado correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar proyecto:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar proyecto'
    });
  }
});

export default router;
