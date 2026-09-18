import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as teamService from '../services/team.service';

export const create = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;
    const {
        name, category_id, short_name = '', primary_color = '',
        contact_email = '', contact_phone = '', coach_ids = []
    } = req.body;

    if (!name || !category_id) {
        return {
            code: 400,
            data: { message: 'El nombre del equipo y la categoría son obligatorios' }
        };
    }

    const result = await teamService.createTeam(
        organizationId, category_id, name, short_name,
        primary_color, contact_email, contact_phone, coach_ids
    );

    return { code: 201, data: result };
});

export const getAll = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;
    const result = await teamService.getTeams(organizationId);

    return { code: 200, data: result };
});

export const update = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const organizationId = req.user.organization_id;
    const {
        name, category_id, short_name = '', primary_color = '',
        contact_email = '', contact_phone = '', coach_ids = []
    } = req.body;

    if (!name || !category_id) {
        return { code: 400, data: { message: 'El nombre y la categoría son obligatorios' } };
    }

    const success = await teamService.updateTeam(
        Number(id), organizationId, category_id, name, short_name,
        primary_color, contact_email, contact_phone, coach_ids
    );

    if (!success) {
        return { code: 404, data: { message: 'Equipo no encontrado o sin permisos' } };
    }

    return { code: 200, data: { message: 'Equipo actualizado correctamente' } };
});

export const remove = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const organizationId = req.user.organization_id;

    const success = await teamService.deleteTeam(Number(id), organizationId);

    if (!success) {
        return { code: 404, data: { message: 'Equipo no encontrado o sin permisos' } };
    }

    return { code: 200, data: { message: 'Equipo eliminado correctamente' } };
});