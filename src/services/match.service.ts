import * as matchModel from '../model/match.model';
import { Actor } from '../utils/audit';
import { getEventsByMatch } from '../model/match_events.model';
import { getRules } from '../model/recalc.model';

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

export async function getMatch(id: number, tournamentId: number) {
    return await matchModel.findById(id, tournamentId);
}

export async function findScheduleConflicts(
    organizationId: number, matchId: number, tournamentId: number,
    scheduledAt: string, fieldId: number | null, teamIds: number[]
) {
    const { match_duration_minutes } = await getRules(tournamentId);
    return await matchModel.findScheduleConflicts(organizationId, matchId, scheduledAt, fieldId ?? null, teamIds, match_duration_minutes);
}

export async function getAssignedMatches(userId: number, organizationId: number) {
    return await matchModel.findAssignedToReferee(userId, organizationId);
}

export async function getMatchDetail(id: number, tournamentId: number) {
    const match = await matchModel.findDetail(id, tournamentId);
    if (!match) return null;
    const [events, referees, rosters, rules] = await Promise.all([
        getEventsByMatch(id),
        matchModel.findReferees(id),
        matchModel.findRosters(tournamentId, [match.home_team_id, match.away_team_id].filter(Boolean), id),
        getRules(tournamentId),
    ]);
    return {
        match,
        events,
        referees,
        home_players: rosters.filter(p => Number(p.team_id) === Number(match.home_team_id)),
        away_players: rosters.filter(p => Number(p.team_id) === Number(match.away_team_id)),
        rules: {
            match_duration_minutes: rules.match_duration_minutes,
            yellow_sin_bin_minutes: rules.yellow_sin_bin_minutes,
            red_card_suspension_matches: rules.red_card_suspension_matches,
        },
    };
}

export async function updateMatch(id: number, tournamentId: number, updateFields: any, actor: Actor) {
    return await matchModel.update(id, tournamentId, updateFields, actor);
}

export async function deleteMatch(id: number, tournamentId: number, actor: Actor) {
    return await matchModel.remove(id, tournamentId, actor);
}

export async function finishMatchWithAdvancement(matchId: number, tournamentId: number, actor: Actor, options: matchModel.FinishOptions) {
    return await matchModel.finishAndAdvance(matchId, tournamentId, actor, options);
}

export async function reopenMatch(matchId: number, tournamentId: number, actor: Actor) {
    return await matchModel.reopen(matchId, tournamentId, actor);
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
