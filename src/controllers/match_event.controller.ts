import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as matchEventService from '../services/match_event.service';
import * as matchService from '../services/match.service';

export const addEvent = catchAsync(async (req: AuthRequest, res) => {
    const { matchId } = req.params;
    const organizationId = req.user.organization_id;
    const { team_id, player_id = null, assist_player_id = null, event_type, minute = null } = req.body;

    if (req.user.role === 'referee') {
        const assigned = await matchService.isRefereeAssigned(Number(matchId), req.user.id);
        if (!assigned) {
            return { code: 403, data: { message: 'No estás asignado como árbitro de este partido' } };
        }
    }

    if (!team_id || !event_type) {
        return { code: 400, data: { message: 'El equipo y el tipo de evento son obligatorios' } };
    }

    const validEvents = ['goal', 'own_goal', 'yellow_card', 'red_card', 'substitution', 'foul'];
    if (!validEvents.includes(event_type)) {
        return { code: 400, data: { message: 'Tipo de evento inválido' } };
    }

    const matchInfo = await matchEventService.getMatchAccessInfo(Number(matchId), organizationId);
    if (!matchInfo) {
        return { code: 403, data: { message: 'Acceso denegado al partido' } };
    }

    if (matchInfo.home_team_id !== team_id && matchInfo.away_team_id !== team_id) {
        return { code: 400, data: { message: 'El equipo seleccionado no participa en este partido' } };
    }

    if (matchInfo.status === 'finished') {
        return { code: 409, data: { message: 'El partido ya finalizó; no se pueden registrar más eventos' } };
    }

    for (const pid of [player_id, assist_player_id]) {
        if (pid !== null && pid !== undefined) {
            const ok = await matchEventService.playerBelongsToTeam(Number(pid), team_id);
            if (!ok) {
                return { code: 400, data: { message: 'El jugador no pertenece al equipo seleccionado' } };
            }
        }
    }

    const result = await matchEventService.createEvent(
        Number(matchId), team_id, player_id, assist_player_id, event_type, minute, matchInfo
    );

    return { code: 201, data: result };
});

export const getEvents = catchAsync(async (req: AuthRequest, res) => {
    const { matchId } = req.params;
    const organizationId = req.user.organization_id;

    const matchInfo = await matchEventService.getMatchAccessInfo(Number(matchId), organizationId);
    if (!matchInfo) {
        return { code: 403, data: { message: 'Acceso denegado al partido' } };
    }

    const result = await matchEventService.getMatchEvents(Number(matchId));
    return { code: 200, data: result };
});

export const removeEvent = catchAsync(async (req: AuthRequest, res) => {
    const { matchId, eventId } = req.params;
    const organizationId = req.user.organization_id;

    const matchInfo = await matchEventService.getMatchAccessInfo(Number(matchId), organizationId);
    if (!matchInfo) {
        return { code: 403, data: { message: 'Acceso denegado al partido' } };
    }
    if (req.user.role === 'referee') {
        const assigned = await matchService.isRefereeAssigned(Number(matchId), req.user.id);
        if (!assigned) {
            return { code: 403, data: { message: 'No estás asignado como árbitro de este partido' } };
        }
    }

    if (matchInfo.status === 'finished') {
        return { code: 409, data: { message: 'El partido ya finalizó; no se pueden eliminar eventos' } };
    }

    const success = await matchEventService.removeEvent(Number(eventId), Number(matchId), matchInfo);
    return success
        ? { code: 200, data: { message: 'Evento eliminado y marcador actualizado' } }
        : { code: 404, data: { message: 'Evento no encontrado' } };
});
