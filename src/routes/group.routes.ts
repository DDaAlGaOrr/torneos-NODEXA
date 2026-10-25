import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as groupController from '../controllers/group.controller';

export const groupRoutes = Router();

groupRoutes.post('/:tournamentId/groups/draw', requireAuth, requireRole('admin'), groupController.draw);
groupRoutes.post('/:tournamentId/groups', requireAuth, requireRole('admin'), groupController.create);
groupRoutes.get('/:tournamentId/groups', requireAuth, groupController.getAll);
groupRoutes.put('/:tournamentId/groups/:id', requireAuth, requireRole('admin'), groupController.rename);
groupRoutes.delete('/:tournamentId/groups/:id', requireAuth, requireRole('admin'), groupController.remove);
groupRoutes.post('/:tournamentId/groups/:id/teams', requireAuth, requireRole('admin'), groupController.addTeam);
groupRoutes.put('/:tournamentId/groups/:id/teams/:teamId', requireAuth, requireRole('admin'), groupController.moveTeam);
groupRoutes.delete('/:tournamentId/groups/:id/teams/:teamId', requireAuth, requireRole('admin'), groupController.removeTeam);
