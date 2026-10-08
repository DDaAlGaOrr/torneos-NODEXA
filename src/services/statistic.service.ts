import * as statisticModel from '../model/statistic.model';

export async function getTournamentTopScorers(tournamentId: number) {
    return await statisticModel.getTopScorers(tournamentId);
}

export async function getTournamentFairPlay(tournamentId: number) {
    return await statisticModel.getFairPlay(tournamentId);
}