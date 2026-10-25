import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as meController from '../controllers/me.controller';

/** Rutas del usuario que inició sesión (panel del entrenador) */
export const meRoutes = Router();

meRoutes.get('/teams', requireAuth, requireRole('coach'), meController.getMyTeams);
meRoutes.get('/teams/:teamId/overview', requireAuth, requireRole('coach', 'admin'), meController.getTeamOverview);
