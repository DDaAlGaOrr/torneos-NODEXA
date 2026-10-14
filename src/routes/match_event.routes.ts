import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as matchEventController from '../controllers/match_event.controller';

export const matchesRoutes = Router();

matchesRoutes.post('/:matchId/events', requireAuth, requireRole('admin', 'referee'), matchEventController.addEvent);
matchesRoutes.get('/:matchId/events', requireAuth, matchEventController.getEvents);
matchesRoutes.delete('/:matchId/events/:eventId', requireAuth, requireRole('admin', 'referee'), matchEventController.removeEvent);
