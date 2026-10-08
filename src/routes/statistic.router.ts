import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as statisticController from '../controllers/statistic.controller';

export const statisticsRoutes = Router();

statisticsRoutes.get('/:tournamentId/statistics/top-scorers', requireAuth, statisticController.getTopScorers);
statisticsRoutes.get('/:tournamentId/statistics/fair-play', requireAuth, statisticController.getFairPlay);
