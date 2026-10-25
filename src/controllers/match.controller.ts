import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as matchService from '../services/match.service';
import { pickAllowed } from '../utils/fields';
import { MATCH_UPDATABLE, FINISHED_MATCH_EDITABLE } from '../model/match.model';

export const create = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    const organizationId = req.user.organization_id;

    const { round_id, home_team_id = null, away_team_id = null, field_id = null, scheduled_at = null } = req.body;

    if (!round_id) {
        return { code: 400, data: { message: 'El ID de la jornada (round_id) es obligatorio' } };
    }

    const hasAccess = await matchService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    const refsError = await matchService.validateRefs(Number(tournamentId), organizationId, {
        round_id, home_team_id, away_team_id, field_id
    });
    if (refsError) {
        return { code: 400, data: { message: refsError } };
    }

    const result = await matchService.createMatch(
        Number(tournamentId), round_id, home_team_id, away_team_id, field_id, scheduled_at
    );
    return { code: 201, data: result };
});
export const getByTournament = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    const organizationId = req.user.organization_id;

    const hasAccess = await matchService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    const result = await matchService.getMatchesByTournament(Number(tournamentId));
    return { code: 200, data: result };
});

/** Partidos donde el usuario actual es árbitro. */
export const getAssigned = catchAsync(async (req: AuthRequest, res) => {
    return { code: 200, data: await matchService.getAssignedMatches(req.user.id, req.user.organization_id) };
});

/** Ficha completa para la captura: partido, plantillas, incidencias, árbitros y reglas. */
export const getOne = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id } = req.params;
    const hasAccess = await matchService.checkTournamentAccess(Number(tournamentId), req.user.organization_id);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }
    const detail = await matchService.getMatchDetail(Number(id), Number(tournamentId));
    if (!detail) {
        return { code: 404, data: { message: 'Partido no encontrado' } };
    }
    const canCapture = req.user.role === 'admin'
        || (req.user.role === 'referee' && detail.referees.some((r: any) => Number(r.user_id) === Number(req.user.id)));
    return { code: 200, data: { ...detail, can_capture: canCapture } };
});

export const update = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id } = req.params;
    const organizationId = req.user.organization_id;
    const updateFields = pickAllowed(req.body, MATCH_UPDATABLE);

    const hasAccess = await matchService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    if (Object.keys(updateFields).length === 0) {
        return { code: 400, data: { message: 'No hay datos para actualizar' } };
    }

    if (updateFields.status === 'finished') {
        return { code: 400, data: { message: 'Para finalizar un partido usa el endpoint /finish' } };
    }

    const current = await matchService.getMatch(Number(id), Number(tournamentId));
    if (!current) {
        return { code: 404, data: { message: 'Partido no encontrado' } };
    }
    // Un resultado finalizado solo se corrige reabriendo el partido (así se revierte la llave y la tabla)
    if (current.status === 'finished' && Object.keys(updateFields).some(k => !FINISHED_MATCH_EDITABLE.includes(k))) {
        return { code: 409, data: { message: 'El partido ya finalizó: solo puedes cambiar cancha y horario. Para corregir el resultado, reábrelo.' } };
    }
    for (const key of ['score_home', 'score_away', 'penalties_home', 'penalties_away'] as const) {
        if (updateFields[key] !== undefined && updateFields[key] !== null && !isScore(updateFields[key])) {
            return { code: 400, data: { message: 'Los marcadores deben ser números enteros entre 0 y 99' } };
        }
    }

    if (updateFields.scheduled_at !== undefined && updateFields.scheduled_at !== null) {
        if (typeof updateFields.scheduled_at !== 'string' || !isRealDateTime(updateFields.scheduled_at)) {
            return { code: 400, data: { message: 'La fecha y hora deben tener el formato AAAA-MM-DD HH:MM' } };
        }
        updateFields.scheduled_at = updateFields.scheduled_at.length === 16 ? `${updateFields.scheduled_at}:00` : updateFields.scheduled_at;
    }

    const refsError = await matchService.validateRefs(Number(tournamentId), organizationId, updateFields);
    if (refsError) {
        return { code: 400, data: { message: refsError } };
    }

    // Choques de horario: misma cancha o un equipo con otro partido a la misma hora (se puede forzar)
    const scheduleTouched = ['scheduled_at', 'field_id', 'status', 'home_team_id', 'away_team_id'].some(k => k in updateFields);
    const finalStatus = updateFields.status ?? current.status;
    const finalAt = 'scheduled_at' in updateFields ? updateFields.scheduled_at : current.scheduled_at_local;
    if (scheduleTouched && finalAt && ['scheduled', 'in_progress'].includes(finalStatus) && req.body?.force !== true) {
        const pick = (k: 'field_id' | 'home_team_id' | 'away_team_id') => (k in updateFields ? updateFields[k] : current[k]);
        const conflicts = await matchService.findScheduleConflicts(
            organizationId, Number(id), Number(tournamentId), finalAt, pick('field_id'),
            [pick('home_team_id'), pick('away_team_id')].filter(Boolean).map(Number),
        );
        if (conflicts.length > 0) {
            const c = conflicts[0];
            const what = c.reason === 'field' ? `la cancha ${c.field_name ?? ''} está ocupada` : 'uno de los equipos ya juega a esa hora';
            return {
                code: 409,
                data: { message: `Choque de horario: ${what} (${c.home_team ?? '?'} vs ${c.away_team ?? '?'}). Envía force: true para guardarlo de todos modos.`, conflicts },
            };
        }
    }

    const success = await matchService.updateMatch(Number(id), Number(tournamentId), updateFields, req.user);
    return success
        ? { code: 200, data: { message: 'Partido actualizado correctamente' } }
        : { code: 404, data: { message: 'Partido no encontrado' } };
});

export const remove = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id } = req.params;
    const organizationId = req.user.organization_id;

    const hasAccess = await matchService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    const current = await matchService.getMatch(Number(id), Number(tournamentId));
    if (!current) {
        return { code: 404, data: { message: 'Partido no encontrado' } };
    }
    if (current.status === 'in_progress' || current.status === 'finished' || current.events_count > 0) {
        return { code: 409, data: { message: 'El partido ya se jugó o tiene incidencias registradas; cancélalo en lugar de eliminarlo' } };
    }

    const success = await matchService.deleteMatch(Number(id), Number(tournamentId), req.user);
    return success
        ? { code: 200, data: { message: 'Partido eliminado' } }
        : { code: 404, data: { message: 'Partido no encontrado' } };
});

const DATETIME_RE = /^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** Formato correcto y fecha que existe (MySQL sin modo estricto guardaría '0000-00-00'). */
const isRealDateTime = (v: string) => {
    if (!DATETIME_RE.test(v)) return false;
    const [y, m, d] = v.slice(0, 10).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const isScore = (v: any) => Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 99;

/** Body opcional: { penalties_home, penalties_away } para definir una eliminatoria empatada. */
export const finish = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id } = req.params;
    const organizationId = req.user.organization_id;
    const body = req.body ?? {};

    const hasAccess = await matchService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado' } };
    }

    if (req.user.role === 'referee') {
        const assigned = await matchService.isRefereeAssigned(Number(id), req.user.id);
        if (!assigned) {
            return { code: 403, data: { message: 'No estás asignado como árbitro de este partido' } };
        }
    }

    const options: { penalties_home?: number | null; penalties_away?: number | null } = {};
    for (const key of ['penalties_home', 'penalties_away'] as const) {
        if (body[key] === undefined) continue;
        if (body[key] !== null && !isScore(body[key])) {
            return { code: 400, data: { message: 'Los penales deben ser números enteros entre 0 y 99' } };
        }
        options[key] = body[key] === null ? null : Number(body[key]);
    }

    const result = await matchService.finishMatchWithAdvancement(Number(id), Number(tournamentId), req.user, options);
    return { code: 200, data: { message: 'Partido finalizado. Tabla, estadísticas y llaves actualizadas.', ...result } };
});

/** Regresa un partido finalizado a "en juego" para corregir su resultado (solo administradores). */
export const reopen = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id } = req.params;
    const hasAccess = await matchService.checkTournamentAccess(Number(tournamentId), req.user.organization_id);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado' } };
    }

    await matchService.reopenMatch(Number(id), Number(tournamentId), req.user);
    return { code: 200, data: { message: 'Partido reabierto. Corrige el resultado y vuelve a finalizarlo.' } };
});

export const getReferees = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id } = req.params;
    const organizationId = req.user.organization_id;

    const hasAccess = await matchService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess || !(await matchService.matchBelongsToTournament(Number(id), Number(tournamentId)))) {
        return { code: 403, data: { message: 'Acceso denegado al partido' } };
    }

    const result = await matchService.getReferees(Number(id));
    return { code: 200, data: result };
});

export const assignReferee = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id } = req.params;
    const organizationId = req.user.organization_id;
    const { user_id, role = 'principal' } = req.body;

    if (!user_id) {
        return { code: 400, data: { message: 'El user_id del árbitro es obligatorio' } };
    }
    if (typeof role !== 'string' || role.trim() === '' || role.length > 50) {
        return { code: 400, data: { message: 'Rol de árbitro inválido (máx. 50 caracteres)' } };
    }

    const hasAccess = await matchService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess || !(await matchService.matchBelongsToTournament(Number(id), Number(tournamentId)))) {
        return { code: 403, data: { message: 'Acceso denegado al partido' } };
    }

    const validReferee = await matchService.isActiveReferee(Number(user_id), organizationId);
    if (!validReferee) {
        return { code: 400, data: { message: 'El usuario no es un árbitro activo de tu organización' } };
    }

    const result = await matchService.assignReferee(Number(id), Number(user_id), role.trim());
    return { code: 201, data: result };
});

export const removeReferee = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id, userId } = req.params;
    const organizationId = req.user.organization_id;

    const hasAccess = await matchService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess || !(await matchService.matchBelongsToTournament(Number(id), Number(tournamentId)))) {
        return { code: 403, data: { message: 'Acceso denegado al partido' } };
    }

    const success = await matchService.removeReferee(Number(id), Number(userId));
    return success
        ? { code: 200, data: { message: 'Árbitro desasignado del partido' } }
        : { code: 404, data: { message: 'Asignación no encontrada' } };
});
