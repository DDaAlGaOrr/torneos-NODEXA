import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as teamController from '../controllers/team.controller';

export const teamRoutes = Router();

teamRoutes.post('/', requireAuth, teamController.create);
teamRoutes.get('/', requireAuth, teamController.getAll);
teamRoutes.put('/:id', requireAuth, teamController.update);
teamRoutes.delete('/:id', requireAuth, teamController.remove);

export default teamRoutes;