import * as matchModel from '../model/match.model';

export async function checkTournamentAccess(tournamentId: number, organizationId: number) {
    return await matchModel.verifyTournamentOwnership(tournamentId, organizationId);
}

export async function createMatch(
    tournamentId: number, roundId: number, homeTeamId: number,
    awayTeamId: number, fieldId: number | null, scheduledAt: string | null
) {
    return await matchModel.create(tournamentId, roundId, homeTeamId, awayTeamId, fieldId, scheduledAt);
}

export async function getMatchesByTournament(tournamentId: number) {
    return await matchModel.findAllByTournament(tournamentId);
}

export async function updateMatch(id: number, updateFields: any) {
    return await matchModel.update(id, updateFields);
}

export async function deleteMatch(id: number) {
    return await matchModel.remove(id);
}

export async function finishMatchWithAdvancement(matchId: number) {
    return await matchModel.finishAndAdvance(matchId);
}