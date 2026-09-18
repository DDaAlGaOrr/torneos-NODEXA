import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as standingController from '../controllers/standing.controller';

export const standingsRoutes = Router();

standingsRoutes.get('/:tournamentId/standings', requireAuth, standingController.getStandings);
