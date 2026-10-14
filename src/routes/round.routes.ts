import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as roundController from '../controllers/round.controller';

export const roundsRoutes = Router();

// Quedaría: POST /tournaments/1/rounds
roundsRoutes.post('/:tournamentId/rounds', requireAuth, requireRole('admin'), roundController.create);
roundsRoutes.get('/:tournamentId/rounds', requireAuth, roundController.getByTournament);
roundsRoutes.put('/:tournamentId/rounds/:id', requireAuth, requireRole('admin'), roundController.update);
roundsRoutes.delete('/:tournamentId/rounds/:id', requireAuth, requireRole('admin'), roundController.remove);
