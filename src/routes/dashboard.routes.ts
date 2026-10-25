import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as dashboardController from '../controllers/dashboard.controller';

export const dashboardRoutes = Router();

dashboardRoutes.get('/', requireAuth, requireRole('admin'), dashboardController.getSummary);
// El canal en vivo lo puede usar cualquier panel de la liga (árbitros y entrenadores también)
dashboardRoutes.get('/stream', requireAuth, dashboardController.stream);
