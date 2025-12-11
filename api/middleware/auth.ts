/**
 * Middleware de autenticación para proteger rutas API
 */
import { Request, Response, NextFunction } from 'express';
import { authService, User } from '../services/authService.js';

// Extender el tipo Request para incluir el usuario autenticado
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

/**
 * Middleware que requiere autenticación
 * Si el token es válido, añade user y userId al request
 * Si no, responde con 401
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: 'Token de autenticación requerido' });
      return;
    }

    // Formato esperado: "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({ error: 'Formato de token inválido' });
      return;
    }

    const token = parts[1];
    const user = await authService.verifyToken(token);

    if (!user) {
      res.status(401).json({ error: 'Token inválido o expirado' });
      return;
    }

    // Añadir usuario al request
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    console.error('Error en middleware de autenticación:', error);
    res.status(500).json({ error: 'Error interno de autenticación' });
  }
};

/**
 * Middleware opcional de autenticación
 * Si hay token válido, añade user al request
 * Si no hay token o es inválido, continúa sin usuario
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      next();
      return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      next();
      return;
    }

    const token = parts[1];
    const user = await authService.verifyToken(token);

    if (user) {
      req.user = user;
      req.userId = user.id;
    }

    next();
  } catch (error) {
    // En caso de error, simplemente continuar sin usuario
    next();
  }
};

/**
 * Helper para obtener el userId del request
 * Útil para servicios que necesitan el tenant
 */
export const getUserIdFromRequest = (req: Request): string | undefined => {
  return req.userId;
};

/**
 * Helper para obtener el usuario completo del request
 */
export const getUserFromRequest = (req: Request): User | undefined => {
  return req.user;
};
