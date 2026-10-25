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
export async function jerseyTaken(teamId: number, jerseyNumber: string, excludeId?: number) {
    return await playerModel.jerseyTaken(teamId, jerseyNumber, excludeId);
}

export async function countEvents(playerId: number, teamId: number) {
    return await playerModel.countEvents(playerId, teamId);
}
