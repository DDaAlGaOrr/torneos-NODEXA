import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as standingController from '../controllers/standing.controller';

export const standingsRoutes = Router();

// Reconstruye tabla, estadísticas y sanciones desde los partidos y eventos guardados
standingsRoutes.post('/:tournamentId/recalculate', requireAuth, requireRole('admin'), standingController.recalculate);
standingsRoutes.get('/:tournamentId/standings', requireAuth, standingController.getStandings);
standingsRoutes.get('/:tournamentId/standings/groups', requireAuth, standingController.getStandingsByGroup);
