/**
 * Rutas de autenticación de usuarios
 * Maneja registro, login, logout y gestión de perfil
 */
import { Router, type Request, type Response } from 'express';
import { authService } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * Registrar nuevo usuario
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, contraseña y nombre son requeridos' });
      return;
    }

    const result = await authService.register({ email, password, name });

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: result.user,
      token: result.token,
      expiresIn: result.expiresIn
    });
  } catch (error: any) {
    console.error('Error en registro:', error);

    if (error.message === 'El email ya está registrado') {
      res.status(409).json({ error: error.message });
      return;
    }

    if (error.message.includes('inválido') || error.message.includes('caracteres')) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

/**
 * Iniciar sesión
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email y contraseña son requeridos' });
      return;
    }

    const result = await authService.login({ email, password });

    res.json({
      message: 'Sesión iniciada exitosamente',
      user: result.user,
      token: result.token,
      expiresIn: result.expiresIn
    });
  } catch (error: any) {
    console.error('Error en login:', error);

    if (error.message === 'Credenciales inválidas') {
      res.status(401).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

/**
 * Cerrar sesión
 * POST /api/auth/logout
 */
router.post('/logout', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (req.userId && token) {
      await authService.logout(req.userId, token);
    }

    res.json({ message: 'Sesión cerrada exitosamente' });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
});

/**
 * Cerrar todas las sesiones
 * POST /api/auth/logout-all
 */
router.post('/logout-all', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.userId) {
      await authService.logoutAll(req.userId);
    }

    res.json({ message: 'Todas las sesiones cerradas exitosamente' });
  } catch (error) {
    console.error('Error en logout-all:', error);
    res.status(500).json({ error: 'Error al cerrar sesiones' });
  }
});

/**
 * Obtener perfil del usuario actual
 * GET /api/auth/me
 */
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

/**
 * Actualizar perfil del usuario
 * PUT /api/auth/me
 */
router.put('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email } = req.body;

    if (!name && !email) {
      res.status(400).json({ error: 'Al menos un campo para actualizar es requerido' });
      return;
    }

    const updates: { name?: string; email?: string } = {};
    if (name) updates.name = name;
    if (email) updates.email = email;

    const updatedUser = await authService.updateUser(req.userId!, updates);

    res.json({
      message: 'Perfil actualizado exitosamente',
      user: updatedUser
    });
  } catch (error: any) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

/**
 * Cambiar contraseña
 * PUT /api/auth/password
 */
router.put('/password', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Contraseña actual y nueva contraseña son requeridas' });
      return;
    }

    await authService.changePassword(req.userId!, currentPassword, newPassword);

    res.json({ message: 'Contraseña cambiada exitosamente. Por favor, inicia sesión de nuevo.' });
  } catch (error: any) {
    console.error('Error al cambiar contraseña:', error);

    if (error.message === 'Contraseña actual incorrecta') {
      res.status(400).json({ error: error.message });
      return;
    }

    if (error.message.includes('caracteres')) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

/**
 * Guardar API keys del usuario
 * POST /api/auth/api-keys
 */
router.post('/api-keys', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider, apiKey } = req.body;

    if (!provider || !apiKey) {
      res.status(400).json({ error: 'Provider y apiKey son requeridos' });
      return;
    }

    const validProviders = ['openai', 'anthropic', 'google'];
    if (!validProviders.includes(provider)) {
      res.status(400).json({ error: `Provider inválido. Debe ser uno de: ${validProviders.join(', ')}` });
      return;
    }

    await authService.saveApiKey(req.userId!, provider, apiKey);

    res.json({ message: `API key de ${provider} guardada exitosamente` });
  } catch (error) {
    console.error('Error al guardar API key:', error);
    res.status(500).json({ error: 'Error al guardar API key' });
  }
});

/**
 * Obtener estado de API keys del usuario (sin revelar las keys)
 * GET /api/auth/api-keys
 */
router.get('/api-keys', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const keys = await authService.getApiKeys(req.userId!);

    // Solo devolver qué providers tienen keys configuradas, no las keys en sí
    const status: { [provider: string]: boolean } = {};
    for (const provider of ['openai', 'anthropic', 'google']) {
      status[provider] = !!keys[provider];
    }

    res.json({ apiKeys: status });
  } catch (error) {
    console.error('Error al obtener API keys:', error);
    res.status(500).json({ error: 'Error al obtener API keys' });
  }
});

/**
 * Eliminar API key del usuario
 * DELETE /api/auth/api-keys/:provider
 */
router.delete('/api-keys/:provider', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider } = req.params;

    const validProviders = ['openai', 'anthropic', 'google'];
    if (!validProviders.includes(provider)) {
      res.status(400).json({ error: `Provider inválido. Debe ser uno de: ${validProviders.join(', ')}` });
      return;
    }

    await authService.deleteApiKey(req.userId!, provider);

    res.json({ message: `API key de ${provider} eliminada exitosamente` });
  } catch (error) {
    console.error('Error al eliminar API key:', error);
    res.status(500).json({ error: 'Error al eliminar API key' });
  }
});

/**
 * Verificar token (útil para el frontend)
 * GET /api/auth/verify
 */
router.get('/verify', requireAuth, async (req: Request, res: Response): Promise<void> => {
  res.json({ valid: true, user: req.user });
});

export default router;
