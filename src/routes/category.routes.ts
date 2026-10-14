import { Router } from 'express';
import * as categoryController from '../controllers/category.controller'
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

export const categoryRoutes = Router();

categoryRoutes.post('/', requireAuth, requireRole('admin'), categoryController.create);
categoryRoutes.get('/', requireAuth, categoryController.getAll);
categoryRoutes.put('/:id', requireAuth, requireRole('admin'), categoryController.update);
categoryRoutes.delete('/:id', requireAuth, requireRole('admin'), categoryController.remove);