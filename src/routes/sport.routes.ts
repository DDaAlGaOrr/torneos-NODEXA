import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as sportController from '../controllers/sport.controller';

export const sportRoutes = Router();

sportRoutes.get('/', requireAuth, sportController.getAll);
