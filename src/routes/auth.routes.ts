import { Router } from 'express';
import * as authController from '../controllers/auth.controller'

export const authRoutes = Router();

authRoutes.post('/', authController.login);