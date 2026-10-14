import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as teamController from '../controllers/team.controller';

export const teamRoutes = Router();

teamRoutes.post('/', requireAuth, requireRole('admin'), teamController.create);
teamRoutes.get('/', requireAuth, teamController.getAll);
teamRoutes.put('/:id', requireAuth, requireRole('admin'), teamController.update);
teamRoutes.delete('/:id', requireAuth, requireRole('admin'), teamController.remove);
teamRoutes.put('/:id/captain', requireAuth, requireRole('admin'), teamController.setCaptain);

export default teamRoutes;