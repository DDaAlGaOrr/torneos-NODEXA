import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as playerService from '../services/player.service';

export const create = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;
    const { team_id, name, jersey_number = '', position = '' } = req.body;

    if (!team_id || !name) {
        return { code: 400, data: { message: 'El equipo y el nombre son obligatorios' } };
    }

    const hasAccess = await playerService.checkTeamAccess(team_id, organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'No tienes permiso para agregar jugadores a este equipo' } };
    }

    const result = await playerService.createPlayer(team_id, name, jersey_number, position);
    return { code: 201, data: result };
});

export const getByTeam = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;
    const teamId = Number(req.params.teamId);

    const hasAccess = await playerService.checkTeamAccess(teamId, organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado a este equipo' } };
    }

    const result = await playerService.getPlayersByTeam(teamId);
    return { code: 200, data: result };
});

export const update = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { team_id, ...updateFields } = req.body;
    const organizationId = req.user.organization_id;

    if (!team_id) {
        return { code: 400, data: { message: 'Se requiere el team_id por seguridad' } };
    }

    const hasAccess = await playerService.checkTeamAccess(team_id, organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado' } };
    }

    if (Object.keys(updateFields).length === 0) {
        return { code: 400, data: { message: 'No se enviaron datos para actualizar' } };
    }

    const success = await playerService.updatePlayer(Number(id), updateFields);
    return success
        ? { code: 200, data: { message: 'Jugador actualizado' } }
        : { code: 404, data: { message: 'Jugador no encontrado' } };
});

export const remove = catchAsync(async (req: AuthRequest, res) => {
    const { id, teamId } = req.params;
    const organizationId = req.user.organization_id;

    const hasAccess = await playerService.checkTeamAccess(Number(teamId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado' } };
    }

    const success = await playerService.deletePlayer(Number(id));
    return success
        ? { code: 200, data: { message: 'Jugador eliminado' } }
        : { code: 404, data: { message: 'Jugador no encontrado' } };
});