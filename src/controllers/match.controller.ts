import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as matchService from '../services/match.service';
import { pickAllowed } from '../utils/fields';
import { MATCH_UPDATABLE } from '../model/match.model';

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

    const refsError = await matchService.validateRefs(Number(tournamentId), organizationId, updateFields);
    if (refsError) {
        return { code: 400, data: { message: refsError } };
    }

    const success = await matchService.updateMatch(Number(id), Number(tournamentId), updateFields);
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

    const success = await matchService.deleteMatch(Number(id), Number(tournamentId));
    return success
        ? { code: 200, data: { message: 'Partido eliminado' } }
        : { code: 404, data: { message: 'Partido no encontrado' } };
});

export const finish = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id } = req.params;
    const organizationId = req.user.organization_id;

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

    const success = await matchService.finishMatchWithAdvancement(Number(id), Number(tournamentId));

    return success
        ? { code: 200, data: { message: 'Partido finalizado. Llaves actualizadas si aplica.' } }
        : { code: 404, data: { message: 'Partido no encontrado' } };
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
