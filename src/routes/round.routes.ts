import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as roundController from '../controllers/round.controller';

export const roundsRoutes = Router();

// Quedaría: POST /tournaments/1/rounds
roundsRoutes.post('/:tournamentId/rounds', requireAuth, roundController.create);
roundsRoutes.get('/:tournamentId/rounds', requireAuth, roundController.getByTournament);
roundsRoutes.put('/:tournamentId/rounds/:id', requireAuth, roundController.update);
roundsRoutes.delete('/:tournamentId/rounds/:id', requireAuth, roundController.remove);
