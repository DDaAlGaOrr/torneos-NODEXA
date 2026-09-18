import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as playerController from '../controllers/player.controller';

export const playerRoutes = Router();

playerRoutes.post('/', requireAuth, playerController.create);
playerRoutes.get('/team/:teamId', requireAuth, playerController.getByTeam);
playerRoutes.put('/:id', requireAuth, playerController.update);
playerRoutes.delete('/:id/team/:teamId', requireAuth, playerController.remove);

export default playerRoutes;