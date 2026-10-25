import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import * as auditController from '../controllers/audit.controller';

export const auditRoutes = Router();

auditRoutes.get('/', requireAuth, requireRole('admin'), auditController.getAll);
