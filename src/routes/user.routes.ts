import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as userController from '../controllers/user.controller';

export const userRoutes = Router();

userRoutes.post('/:role', requireAuth, requireRole('admin'), userController.create);
userRoutes.get('/:role', requireAuth, requireRole('admin'), userController.getAll);
userRoutes.put('/:role/:id', requireAuth, requireRole('admin'), userController.update);
userRoutes.delete('/:role/:id', requireAuth, requireRole('admin'), userController.remove);

export default userRoutes;