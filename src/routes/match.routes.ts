import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as matchController from '../controllers/match.controller';

export const matchRoutes = Router();

matchRoutes.put('/:tournamentId/matches/:id/finish', requireAuth, requireRole('admin', 'referee'), matchController.finish);
matchRoutes.post('/:tournamentId/matches', requireAuth, requireRole('admin'), matchController.create);
matchRoutes.get('/:tournamentId/matches', requireAuth, matchController.getByTournament);
matchRoutes.put('/:tournamentId/matches/:id', requireAuth, requireRole('admin'), matchController.update);
matchRoutes.delete('/:tournamentId/matches/:id', requireAuth, requireRole('admin'), matchController.remove);
matchRoutes.get('/:tournamentId/matches/:id/referees', requireAuth, matchController.getReferees);
matchRoutes.post('/:tournamentId/matches/:id/referees', requireAuth, requireRole('admin'), matchController.assignReferee);
matchRoutes.delete('/:tournamentId/matches/:id/referees/:userId', requireAuth, requireRole('admin'), matchController.removeReferee);
