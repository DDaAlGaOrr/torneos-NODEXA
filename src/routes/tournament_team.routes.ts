import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as tournamentTeamController from '../controllers/tournament_team.controller';

export const tournamentTeamRoutes = Router();

tournamentTeamRoutes.post('/:tournamentId/teams', requireAuth, tournamentTeamController.enroll);
tournamentTeamRoutes.get('/:tournamentId/teams', requireAuth, tournamentTeamController.getEnrolledTeams);
tournamentTeamRoutes.delete('/:tournamentId/teams/:teamId', requireAuth, tournamentTeamController.withdraw);
