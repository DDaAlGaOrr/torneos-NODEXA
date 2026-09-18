import * as tournamentTeamModel from '../model/tournament_team.model';

export async function checkAccess(tournamentId: number, teamId: number, organizationId: number) {
    const isTournamentValid = await tournamentTeamModel.verifyTournamentOwnership(tournamentId, organizationId);
    const isTeamValid = await tournamentTeamModel.verifyTeamOwnership(teamId, organizationId);
    return isTournamentValid && isTeamValid;
}

export async function enrollTeam(tournamentId: number, teamId: number) {
    return await tournamentTeamModel.enroll(tournamentId, teamId);
}

export async function getTeams(tournamentId: number) {
    return await tournamentTeamModel.findTeamsByTournament(tournamentId);
}

export async function withdrawTeam(tournamentId: number, teamId: number) {
    return await tournamentTeamModel.removeEnrollment(tournamentId, teamId);
}