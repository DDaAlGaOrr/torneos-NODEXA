import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as roundService from '../services/round.service';
import { pickAllowed } from '../utils/fields';
import { ROUND_UPDATABLE } from '../model/round.model';

const ROUND_TYPES = ['group', 'bracket'];
const ROUND_STATUSES = ['pending', 'in_progress', 'finished'];

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

    if (!ROUND_TYPES.includes(type)) {
        return { code: 400, data: { message: `Tipo de jornada inválido. Valores permitidos: ${ROUND_TYPES.join(', ')}` } };
    }
    if (group_id !== null && !(await roundService.groupBelongsToTournament(Number(group_id), Number(tournamentId)))) {
        return { code: 400, data: { message: 'El grupo no pertenece a este torneo' } };
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
    const updateFields = pickAllowed(req.body, ROUND_UPDATABLE);

    const hasAccess = await roundService.checkTournamentAccess(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    if (Object.keys(updateFields).length === 0) {
        return { code: 400, data: { message: 'No hay datos para actualizar' } };
    }

    if (updateFields.type !== undefined && !ROUND_TYPES.includes(updateFields.type)) {
        return { code: 400, data: { message: `Tipo de jornada inválido. Valores permitidos: ${ROUND_TYPES.join(', ')}` } };
    }
    if (updateFields.status !== undefined && !ROUND_STATUSES.includes(updateFields.status)) {
        return { code: 400, data: { message: `Estatus inválido. Valores permitidos: ${ROUND_STATUSES.join(', ')}` } };
    }
    if (updateFields.group_id !== undefined && updateFields.group_id !== null
        && !(await roundService.groupBelongsToTournament(Number(updateFields.group_id), Number(tournamentId)))) {
        return { code: 400, data: { message: 'El grupo no pertenece a este torneo' } };
    }

    const success = await roundService.updateRound(Number(id), Number(tournamentId), updateFields);
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

    const success = await roundService.deleteRound(Number(id), Number(tournamentId));
    return success
        ? { code: 200, data: { message: 'Jornada eliminada' } }
        : { code: 404, data: { message: 'Jornada no encontrada' } };
});