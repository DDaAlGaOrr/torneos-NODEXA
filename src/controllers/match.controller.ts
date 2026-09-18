import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as matchService from '../services/match.service';

export const create = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    const organizationId = req.user.organization_id;
    const { round_id, home_team_id, away_team_id, field_id = null, scheduled_at = null } = req.body;

    if (!round_id || !home_team_id || !away_team_id) {
        return { code: 400, data: { message: 'Faltan datos obligatorios (Jornada y Equipos)' } };
    }

    const hasAccess = await matchService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
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
    const updateFields = req.body;

    const hasAccess = await matchService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    if (Object.keys(updateFields).length === 0) {
        return { code: 400, data: { message: 'No hay datos para actualizar' } };
    }

    const success = await matchService.updateMatch(Number(id), updateFields);
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

    const success = await matchService.deleteMatch(Number(id));
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

    const success = await matchService.updateMatch(Number(id), { status: 'finished' });
    
    return success 
        ? { code: 200, data: { message: 'Partido finalizado correctamente' } }
        : { code: 404, data: { message: 'Partido no encontrado' } };
});