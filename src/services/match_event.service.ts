import * as matchEventModel from '../model/match_events.model';

export async function getMatchAccessInfo(matchId: number, organizationId: number) {
    return await matchEventModel.verifyMatchAccess(matchId, organizationId);
}

export async function createEvent(
    matchId: number, teamId: number, playerId: number | null,
    assistPlayerId: number | null, eventType: string, minute: number | null,
    matchInfo: any
) {
    return await matchEventModel.addEvent(
        matchId, teamId, playerId, assistPlayerId, eventType, minute, matchInfo
    );
}

export async function getMatchEvents(matchId: number) {
    return await matchEventModel.getEventsByMatch(matchId);
}
export async function playerBelongsToTeam(playerId: number, teamId: number) {
    return await matchEventModel.playerBelongsToTeam(playerId, teamId);
}

export async function removeEvent(eventId: number, matchId: number, matchInfo: any) {
    return await matchEventModel.deleteEvent(eventId, matchId, matchInfo);
}
