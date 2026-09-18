import * as standingModel from '../model/standing.model';

export async function getTournamentStandings(tournamentId: number) {
    return await standingModel.calculateStandings(tournamentId);
}