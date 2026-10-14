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

export async function updateMatch(id: number, tournamentId: number, updateFields: any) {
    return await matchModel.update(id, tournamentId, updateFields);
}

export async function deleteMatch(id: number, tournamentId: number) {
    return await matchModel.remove(id, tournamentId);
}

export async function finishMatchWithAdvancement(matchId: number, tournamentId: number) {
    return await matchModel.finishAndAdvance(matchId, tournamentId);
}
export async function validateRefs(
    tournamentId: number, organizationId: number,
    refs: { round_id?: any; home_team_id?: any; away_team_id?: any; field_id?: any; next_match_id?: any; status?: any }
) {
    return await matchModel.validateMatchRefs(tournamentId, organizationId, refs);
}

export async function isRefereeAssigned(matchId: number, userId: number) {
    return await matchModel.isRefereeAssigned(matchId, userId);
}

export async function matchBelongsToTournament(matchId: number, tournamentId: number) {
    return await matchModel.matchBelongsToTournament(matchId, tournamentId);
}

export async function isActiveReferee(userId: number, organizationId: number) {
    return await matchModel.isActiveReferee(userId, organizationId);
}

export async function assignReferee(matchId: number, userId: number, role: string) {
    return await matchModel.assignReferee(matchId, userId, role);
}

export async function getReferees(matchId: number) {
    return await matchModel.findReferees(matchId);
}

export async function removeReferee(matchId: number, userId: number) {
    return await matchModel.removeReferee(matchId, userId);
}
