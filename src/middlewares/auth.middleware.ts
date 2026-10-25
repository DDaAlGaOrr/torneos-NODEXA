import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.service';

export interface AuthRequest extends Request {
    user?: any
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ status: 'error', message: 'Token requerido o formato inválido', error: 'Token requerido o formato inválido' });
        }
        const token = authHeader.split(' ')[1];
        const decodedUser = verifyToken(token);
        req.user = decodedUser;
        next();
    } catch (error) {
        return res.status(401).json({ status: 'error', message: 'Token inválido o expirado', error: 'Token inválido o expirado' });
    }
};

/** Permite el acceso solo a los roles indicados (el rol viene del JWT). */
export const requireRole = (...roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ status: 'error', message: 'No tienes permisos para realizar esta acción', error: 'No tienes permisos para realizar esta acción' });
        }
        next();
    };
};
