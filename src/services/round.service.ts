import * as roundModel from '../model/round.model';

export async function checkTournamentAccess(tournamentId: number, organizationId: number) {
    return await roundModel.verifyTournamentOwnership(tournamentId, organizationId);
}

export async function createRound(
    tournamentId: number, groupId: number | null, name: string,
    roundOrder: number, type: string
) {
    return await roundModel.create(tournamentId, groupId, name, roundOrder, type);
}

export async function getRoundsByTournament(tournamentId: number) {
    return await roundModel.findAllByTournament(tournamentId);
}

export async function updateRound(id: number, tournamentId: number, updateFields: any) {
    return await roundModel.update(id, tournamentId, updateFields);
}

export async function deleteRound(id: number, tournamentId: number) {
    return await roundModel.remove(id, tournamentId);
}
export async function groupBelongsToTournament(groupId: number, tournamentId: number) {
    return await roundModel.groupBelongsToTournament(groupId, tournamentId);
}
