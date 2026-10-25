import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as playerController from '../controllers/player.controller';
import * as statsController from '../controllers/player_stats.controller';

export const playerRoutes = Router();

playerRoutes.post('/', requireAuth, requireRole('admin', 'coach'), playerController.create);
playerRoutes.get('/team/:teamId', requireAuth, playerController.getByTeam);
playerRoutes.get('/:id/stats', requireAuth, statsController.getPlayerStats);
playerRoutes.put('/:id', requireAuth, requireRole('admin', 'coach'), playerController.update);
playerRoutes.delete('/:id/team/:teamId', requireAuth, requireRole('admin', 'coach'), playerController.remove);

export default playerRoutes;