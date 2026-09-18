import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as tournamentService from '../services/tournament.service';

export const create = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;
    const {
        sport_id, category_id, name, description = '', format,
        max_teams = 16, rules_config = null, start_date = null, end_date = null
    } = req.body;

    if (!sport_id || !name || !format) {
        return { code: 400, data: { message: 'El deporte, nombre y formato son obligatorios' } };
    }

    const result = await tournamentService.createTournament(
        organizationId, sport_id, category_id, name, description,
        format, max_teams, rules_config, start_date, end_date
    );
    return { code: 201, data: result };
});

export const getAll = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;
    const result = await tournamentService.getTournaments(organizationId);

    return { code: 200, data: result };
});

export const update = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const organizationId = req.user.organization_id;
    const updateFields = req.body;

    if (Object.keys(updateFields).length === 0) {
        return { code: 400, data: { message: 'No se enviaron datos para actualizar' } };
    }

    const success = await tournamentService.updateTournament(Number(id), organizationId, updateFields);

    if (!success) {
        return { code: 404, data: { message: 'Torneo no encontrado o sin permisos' } };
    }

    return { code: 200, data: { message: 'Torneo actualizado correctamente' } };
});

export const remove = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const organizationId = req.user.organization_id;

    const success = await tournamentService.deleteTournament(Number(id), organizationId);

    if (!success) {
        return { code: 404, data: { message: 'Torneo no encontrado o sin permisos' } };
    }

    return { code: 200, data: { message: 'Torneo eliminado correctamente' } };
});