import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as scheduleController from '../controllers/schedule.controller';

export const scheduleRoutes = Router();

scheduleRoutes.post('/:tournamentId/schedule/generate', requireAuth, requireRole('admin'), scheduleController.generate);
