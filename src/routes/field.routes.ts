import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as fieldController from '../controllers/field.controller';

export const fieldsRoutes = Router();

fieldsRoutes.post('/', requireAuth, requireRole('admin'), fieldController.create);
fieldsRoutes.get('/', requireAuth, fieldController.getAll);
fieldsRoutes.put('/:id', requireAuth, requireRole('admin'), fieldController.update);
fieldsRoutes.delete('/:id', requireAuth, requireRole('admin'), fieldController.remove);

export default fieldsRoutes;