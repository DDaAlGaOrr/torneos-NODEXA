import * as userModel from '../model/user.model';
import bcrypt from 'bcrypt';

export async function createUser(name: string, email: string, passwordPlain: string, role: string, organizationId: number) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(passwordPlain, salt);

    return await userModel.create(name, email, passwordHash, role, organizationId);
}

export async function getUsersByRole(role: string, organizationId: number) {
    return await userModel.findAllByRole(role, organizationId);
}

export async function updateUser(id: number, name: string, email: string, active: number, role: string, organizationId: number) {
    return await userModel.update(id, name, email, active, role, organizationId);
}

export async function deleteUser(id: number, role: string, organizationId: number) {
    return await userModel.remove(id, role, organizationId);
}