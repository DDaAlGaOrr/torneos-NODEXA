import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as matchEventService from '../services/match_event.service';
import * as matchService from '../services/match.service';

export const addEvent = catchAsync(async (req: AuthRequest, res) => {
    const { matchId } = req.params;
    const organizationId = req.user.organization_id;
    const body = req.body ?? {};
    const toId = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));
    const team_id = toId(body.team_id);
    const player_id = toId(body.player_id);
    const assist_player_id = toId(body.assist_player_id);
    const event_type = body.event_type;
    const minute = toId(body.minute);

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
    if (minute !== null && (!Number.isInteger(minute) || minute < 0 || minute > 200)) {
        return { code: 400, data: { message: 'El minuto debe ser un número entero entre 0 y 200' } };
    }
    if (assist_player_id !== null && event_type !== 'goal') {
        return { code: 400, data: { message: 'Solo los goles llevan asistencia' } };
    }
    if (assist_player_id !== null && assist_player_id === player_id) {
        return { code: 400, data: { message: 'El goleador no puede ser también quien asiste' } };
    }
    if (player_id === null && ['yellow_card', 'red_card'].includes(event_type)) {
        return { code: 400, data: { message: 'Las tarjetas deben asignarse a un jugador' } };
    }

    const matchInfo = await matchEventService.getMatchAccessInfo(Number(matchId), organizationId);
    if (!matchInfo) {
        return { code: 403, data: { message: 'Acceso denegado al partido' } };
    }

    if (Number(matchInfo.home_team_id) !== team_id && Number(matchInfo.away_team_id) !== team_id) {
        return { code: 400, data: { message: 'El equipo seleccionado no participa en este partido' } };
    }

    if (matchInfo.status === 'finished') {
        return { code: 409, data: { message: 'El partido ya finalizó; reábrelo para registrar más eventos' } };
    }
    if (matchInfo.status === 'cancelled' || matchInfo.status === 'postponed') {
        return { code: 409, data: { message: 'El partido está cancelado o suspendido' } };
    }

    for (const pid of [player_id, assist_player_id]) {
        if (pid !== null) {
            const ok = await matchEventService.playerBelongsToTeam(pid, team_id);
            if (!ok) {
                return { code: 400, data: { message: 'El jugador no pertenece al equipo seleccionado' } };
            }
        }
    }

    const result = await matchEventService.createEvent(
        Number(matchId), team_id, player_id, assist_player_id, event_type, minute, matchInfo, req.user
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
        return { code: 409, data: { message: 'El partido ya finalizó; reábrelo para corregir sus eventos' } };
    }

    const success = await matchEventService.removeEvent(Number(eventId), Number(matchId), matchInfo, req.user);
    return success
        ? { code: 200, data: { message: 'Evento eliminado y marcador actualizado' } }
        : { code: 404, data: { message: 'Evento no encontrado' } };
});
