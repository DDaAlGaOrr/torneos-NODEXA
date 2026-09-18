import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as tournamentController from '../controllers/tournament.controller';

export const tournamentRoutes = Router();

tournamentRoutes.post('/', requireAuth, tournamentController.create);
tournamentRoutes.get('/', requireAuth, tournamentController.getAll);
tournamentRoutes.put('/:id', requireAuth, tournamentController.update);
tournamentRoutes.delete('/:id', requireAuth, tournamentController.remove);
