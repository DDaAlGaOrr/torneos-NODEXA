import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as categoryService from '../services/category.service';

export const create = catchAsync(async (req: AuthRequest, res) => {
    const { name } = req.body;
    const organizationId = req.user.organization_id;

    if (!name) {
        return {
            code: 400,
            data: { message: 'El nombre de la categoría es obligatorio' }
        };
    }

    const result = await categoryService.createCategory(name, organizationId);

    return {
        code: 201,
        data: result
    };
});

export const getAll = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;
    const result = await categoryService.getCategories(organizationId);

    return {
        code: 200,
        data: result
    };
});

export const update = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { name } = req.body;
    const organizationId = req.user.organization_id;

    if (!name) {
        return { code: 400, data: { message: 'El nombre de la categoría es obligatorio' } };
    }

    const success = await categoryService.updateCategory(Number(id), name, organizationId);

    if (!success) {
        return { code: 404, data: { message: 'Categoría no encontrada o no tienes permisos' } };
    }

    return { code: 200, data: { message: 'Categoría actualizada correctamente' } };
});

export const remove = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const organizationId = req.user.organization_id;

    const success = await categoryService.deleteCategory(Number(id), organizationId);

    if (!success) {
        return { code: 404, data: { message: 'Categoría no encontrada o no tienes permisos' } };
    }

    return { code: 200, data: { message: 'Categoría eliminada correctamente' } };
});