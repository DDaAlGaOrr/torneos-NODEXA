import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as fieldController from '../controllers/field.controller';

export const fieldsRoutes = Router();

fieldsRoutes.post('/', requireAuth, fieldController.create);
fieldsRoutes.get('/', requireAuth, fieldController.getAll);
fieldsRoutes.put('/:id', requireAuth, fieldController.update);
fieldsRoutes.delete('/:id', requireAuth, fieldController.remove);

export default fieldsRoutes;