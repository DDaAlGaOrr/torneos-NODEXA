import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as userController from '../controllers/user.controller';

export const userRoutes = Router();

userRoutes.post('/:role', requireAuth, userController.create);
userRoutes.get('/:role', requireAuth, userController.getAll);
userRoutes.put('/:role/:id', requireAuth, userController.update);
userRoutes.delete('/:role/:id', requireAuth, userController.remove);

export default userRoutes;