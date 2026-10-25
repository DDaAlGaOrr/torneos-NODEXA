import * as playerModel from '../model/player.model';

export async function createPlayer(teamId: number, name: string, jerseyNumber: string, position: string) {
    return await playerModel.create(teamId, name, jerseyNumber, position);
}

export async function getPlayersByTeam(teamId: number) {
    return await playerModel.findAllByTeam(teamId);
}

export async function updatePlayer(id: number, teamId: number, updateFields: any) {
    return await playerModel.update(id, teamId, updateFields);
}

export async function deletePlayer(id: number, teamId: number) {
    return await playerModel.remove(id, teamId);
}

export async function checkTeamAccess(teamId: number, organizationId: number) {
    return await playerModel.verifyTeamOwnership(teamId, organizationId);
}

/**
 * ¿Puede el usuario modificar la plantilla del equipo?
 * Administrador: cualquier equipo de su liga. Entrenador: solo los equipos donde está asignado.
 */
export async function canManageTeam(user: { id: number; role: string; organization_id: number }, teamId: number) {
    if (!(await playerModel.verifyTeamOwnership(teamId, user.organization_id))) return false;
    if (user.role === 'coach') return await playerModel.isCoachOfTeam(user.id, teamId);
    return true;
}
export async function jerseyTaken(teamId: number, jerseyNumber: string, excludeId?: number) {
    return await playerModel.jerseyTaken(teamId, jerseyNumber, excludeId);
}

export async function countEvents(playerId: number, teamId: number) {
    return await playerModel.countEvents(playerId, teamId);
}
