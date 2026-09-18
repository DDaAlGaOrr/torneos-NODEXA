import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as matchEventController from '../controllers/match_event.controller';

export const matchesRoutes = Router();

matchesRoutes.post('/:matchId/events', requireAuth, matchEventController.addEvent);
matchesRoutes.get('/:matchId/events', requireAuth, matchEventController.getEvents);
