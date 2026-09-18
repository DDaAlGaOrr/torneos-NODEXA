import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as userService from '../services/user.service';

// Solo permitimos gestionar estos roles mediante este endpoint dinámico
const ALLOWED_ROLES = ['coach', 'referee', 'admin'];

const isValidRole = (role: string) => ALLOWED_ROLES.includes(role);

export const create = catchAsync(async (req: AuthRequest, res) => {
    const role = req.params.role as string;
    const { name, email, password } = req.body;
    const organizationId = req.user.organization_id;

    if (!isValidRole(role)) {
        return { code: 400, data: { message: 'Rol no válido' } };
    }

    if (!name || !email || !password) {
        return { code: 400, data: { message: 'Nombre, email y contraseña son obligatorios' } };
    }

    try {
        const result = await userService.createUser(name, email, password, role, organizationId);
        return { code: 201, data: result };
    } catch (error: any) {
        if (error.code === 'ER_DUP_ENTRY') {
            return { code: 400, data: { message: 'El correo ya está registrado' } };
        }
        throw error;
    }
});

export const getAll = catchAsync(async (req: AuthRequest, res) => {
    const role = req.params.role as string;
    const organizationId = req.user.organization_id;

    if (!isValidRole(role)) {
        return { code: 400, data: { message: 'Rol no válido' } };
    }

    const result = await userService.getUsersByRole(role, organizationId);
    return { code: 200, data: result };
});

export const update = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const role = req.params.role as string;
    const { name, email, active = 1 } = req.body;
    const organizationId = req.user.organization_id;

    if (!isValidRole(role)) {
        return { code: 400, data: { message: 'Rol no válido' } };
    }

    if (!name || !email) {
        return { code: 400, data: { message: 'Nombre y email son obligatorios' } };
    }

    const success = await userService.updateUser(Number(id), name, email, active, role, organizationId);

    if (!success) {
        return { code: 404, data: { message: 'Usuario no encontrado o sin permisos' } };
    }

    return { code: 200, data: { message: 'Usuario actualizado correctamente' } };
});

export const remove = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const role = req.params.role as string;
    const organizationId = req.user.organization_id;

    if (!isValidRole(role)) {
        return { code: 400, data: { message: 'Rol no válido' } };
    }

    const success = await userService.deleteUser(Number(id), role, organizationId);

    if (!success) {
        return { code: 404, data: { message: 'Usuario no encontrado o sin permisos' } };
    }

    return { code: 200, data: { message: 'Usuario eliminado correctamente' } };
});