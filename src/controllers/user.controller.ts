import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as userService from '../services/user.service';
import { logAudit } from '../utils/audit';

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

    if (Number(id) === req.user.id && Number(active) === 0) {
        return { code: 400, data: { message: 'No puedes desactivar tu propia cuenta' } };
    }

    const success = await userService.updateUser(Number(id), name, email, active, role, organizationId);

    if (!success) {
        return { code: 404, data: { message: 'Usuario no encontrado o sin permisos' } };
    }

    return { code: 200, data: { message: 'Usuario actualizado correctamente' } };
});

/** PUT /users/:role/:id/role  { new_role } */
export const changeRole = catchAsync(async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const role = req.params.role as string;
    const newRole = req.body?.new_role;

    if (!isValidRole(role) || !isValidRole(newRole)) {
        return { code: 400, data: { message: `Rol no válido. Valores permitidos: ${ALLOWED_ROLES.join(', ')}` } };
    }
    if (id === req.user.id) {
        return { code: 400, data: { message: 'No puedes cambiar tu propio rol' } };
    }
    if (newRole === role) {
        return { code: 200, data: { message: 'El usuario ya tiene ese rol' } };
    }

    const success = await userService.changeRole(id, role, newRole, req.user.organization_id);
    if (!success) {
        return { code: 404, data: { message: 'Usuario no encontrado o sin permisos' } };
    }
    await logAudit(req.user, { action: 'user.change_role', entityType: 'user', entityId: id, oldValues: { role }, newValues: { role: newRole } });
    return { code: 200, data: { message: 'Rol actualizado. El usuario verá su nuevo panel al volver a iniciar sesión.' } };
});

/** PUT /users/:role/:id/password  { password } — el administrador asigna una contraseña nueva */
export const resetPassword = catchAsync(async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const role = req.params.role as string;
    const password = req.body?.password;

    if (!isValidRole(role)) {
        return { code: 400, data: { message: 'Rol no válido' } };
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
        return { code: 400, data: { message: 'La contraseña debe tener entre 8 y 72 caracteres' } };
    }

    const success = await userService.resetPassword(id, role, req.user.organization_id, password);
    if (!success) {
        return { code: 404, data: { message: 'Usuario no encontrado o sin permisos' } };
    }
    // No se guarda la contraseña en la bitácora, solo que se cambió
    await logAudit(req.user, { action: 'user.reset_password', entityType: 'user', entityId: id });
    return { code: 200, data: { message: 'Contraseña actualizada' } };
});

export const remove = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const role = req.params.role as string;
    const organizationId = req.user.organization_id;

    if (!isValidRole(role)) {
        return { code: 400, data: { message: 'Rol no válido' } };
    }

    if (Number(id) === req.user.id) {
        return { code: 400, data: { message: 'No puedes eliminar tu propia cuenta' } };
    }

    const success = await userService.deleteUser(Number(id), role, organizationId);

    if (!success) {
        return { code: 404, data: { message: 'Usuario no encontrado o sin permisos' } };
    }

    return { code: 200, data: { message: 'Usuario eliminado correctamente' } };
});