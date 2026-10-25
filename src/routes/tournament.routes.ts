import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as tournamentController from '../controllers/tournament.controller';

export const tournamentRoutes = Router();

tournamentRoutes.post('/', requireAuth, requireRole('admin'), tournamentController.create);
tournamentRoutes.get('/', requireAuth, tournamentController.getAll);
tournamentRoutes.put('/:id', requireAuth, requireRole('admin'), tournamentController.update);
tournamentRoutes.delete('/:id', requireAuth, requireRole('admin'), tournamentController.remove);
