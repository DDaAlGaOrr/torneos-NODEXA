import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as fieldService from '../services/field.service';

export const create = catchAsync(async (req: AuthRequest, res) => {
    const { name, location = '', maps_url = '' } = req.body;
    const organizationId = req.user.organization_id;

    if (!name) {
        return { code: 400, data: { message: 'El nombre de la cancha es obligatorio' } };
    }

    const result = await fieldService.createField(name, location, maps_url, organizationId);
    return { code: 201, data: result };
});

export const getAll = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;
    const result = await fieldService.getFields(organizationId);

    return { code: 200, data: result };
});

export const update = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { name, location = '', maps_url = '' } = req.body;
    const organizationId = req.user.organization_id;

    if (!name) {
        return { code: 400, data: { message: 'El nombre de la cancha es obligatorio' } };
    }

    const success = await fieldService.updateField(Number(id), name, location, maps_url, organizationId);

    if (!success) {
        return { code: 404, data: { message: 'Cancha no encontrada o sin permisos' } };
    }

    return { code: 200, data: { message: 'Cancha actualizada correctamente' } };
});

export const remove = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const organizationId = req.user.organization_id;

    const success = await fieldService.deleteField(Number(id), organizationId);

    if (!success) {
        return { code: 404, data: { message: 'Cancha no encontrada o sin permisos' } };
    }

    return { code: 200, data: { message: 'Cancha eliminada correctamente' } };
});