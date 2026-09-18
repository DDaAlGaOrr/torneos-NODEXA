import { Router } from 'express';
import * as categoryController from '../controllers/category.controller'
import { requireAuth } from '../middlewares/auth.middleware';

export const categoryRoutes = Router();

categoryRoutes.post('/', requireAuth, categoryController.create);
categoryRoutes.get('/', requireAuth, categoryController.getAll);
categoryRoutes.put('/:id', requireAuth, categoryController.update);
categoryRoutes.delete('/:id', requireAuth, categoryController.remove);