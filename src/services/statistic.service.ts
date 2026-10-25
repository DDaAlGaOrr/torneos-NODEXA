import * as statisticModel from '../model/statistic.model';
import { getRules } from '../model/recalc.model';

export async function getTournamentTopScorers(tournamentId: number) {
    return await statisticModel.getTopScorers(tournamentId);
}

export async function getTournamentTopAssists(tournamentId: number) {
    return await statisticModel.getTopAssists(tournamentId);
}

export async function getTournamentFairPlay(tournamentId: number) {
    return await statisticModel.getFairPlay(tournamentId, await getRules(tournamentId));
}

export async function getTournamentSanctions(tournamentId: number) {
    return await statisticModel.getSanctions(tournamentId);
}
