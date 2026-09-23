import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as bracketController from '../controllers/bracket.controller';

export const bracketRoutes = Router();

bracketRoutes.get('/:tournamentId/brackets', requireAuth, bracketController.getBracket);
