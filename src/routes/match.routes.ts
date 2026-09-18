import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as matchController from '../controllers/match.controller';

export const matchRoutes = Router();

matchRoutes.put('/:tournamentId/matches/:id/finish', requireAuth, matchController.finish);
matchRoutes.post('/:tournamentId/matches', requireAuth, matchController.create);
matchRoutes.get('/:tournamentId/matches', requireAuth, matchController.getByTournament);
matchRoutes.put('/:tournamentId/matches/:id', requireAuth, matchController.update);
matchRoutes.delete('/:tournamentId/matches/:id', requireAuth, matchController.remove);
