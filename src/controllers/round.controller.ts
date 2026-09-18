import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as roundService from '../services/round.service';

export const create = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    const organizationId = req.user.organization_id;
    const { name, round_order, type = 'group', group_id = null } = req.body;

    if (!name || round_order === undefined) {
        return { code: 400, data: { message: 'El nombre de la jornada y su orden (round_order) son obligatorios' } };
    }

    const hasAccess = await roundService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    const result = await roundService.createRound(
        Number(tournamentId), group_id, name, Number(round_order), type
    );
    return { code: 201, data: result };
});

export const getByTournament = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    const organizationId = req.user.organization_id;

    const hasAccess = await roundService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    const result = await roundService.getRoundsByTournament(Number(tournamentId));
    return { code: 200, data: result };
});

export const update = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id } = req.params;
    const organizationId = req.user.organization_id;
    const updateFields = req.body;

    const hasAccess = await roundService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    if (Object.keys(updateFields).length === 0) {
        return { code: 400, data: { message: 'No hay datos para actualizar' } };
    }

    const success = await roundService.updateRound(Number(id), updateFields);
    return success
        ? { code: 200, data: { message: 'Jornada actualizada' } }
        : { code: 404, data: { message: 'Jornada no encontrada' } };
});

export const remove = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id } = req.params;
    const organizationId = req.user.organization_id;

    const hasAccess = await roundService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    const success = await roundService.deleteRound(Number(id));
    return success
        ? { code: 200, data: { message: 'Jornada eliminada' } }
        : { code: 404, data: { message: 'Jornada no encontrada' } };
});