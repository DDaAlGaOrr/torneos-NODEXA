import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as statsController from '../controllers/player_stats.controller';

export const sanctionRoutes = Router();

sanctionRoutes.put('/:id', requireAuth, requireRole('admin'), statsController.setSanctionStatus);
