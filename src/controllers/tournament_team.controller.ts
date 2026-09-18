import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as tournamentTeamService from '../services/tournament_team.service';
import { verifyTournamentOwnership } from '../model/tournament_team.model'; // Para el GET

export const enroll = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    const { team_id } = req.body;
    const organizationId = req.user.organization_id;

    if (!team_id) {
        return { code: 400, data: { message: 'El team_id es obligatorio' } };
    }

    const hasAccess = await tournamentTeamService.checkAccess(Number(tournamentId), team_id, organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado: El torneo o el equipo no pertenecen a tu liga' } };
    }

    try {
        const result = await tournamentTeamService.enrollTeam(Number(tournamentId), team_id);
        return { code: 201, data: result };
    } catch (error: any) {
        if (error.code === 'ER_DUP_ENTRY') {
            return { code: 400, data: { message: 'El equipo ya está inscrito en este torneo' } };
        }
        throw error;
    }
});

export const getEnrolledTeams = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    const organizationId = req.user.organization_id;

    const isTournamentValid = await verifyTournamentOwnership(Number(tournamentId), organizationId);
    if (!isTournamentValid) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    const result = await tournamentTeamService.getTeams(Number(tournamentId));
    return { code: 200, data: result };
});

export const withdraw = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, teamId } = req.params;
    const organizationId = req.user.organization_id;

    const hasAccess = await tournamentTeamService.checkAccess(Number(tournamentId), Number(teamId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado' } };
    }

    const success = await tournamentTeamService.withdrawTeam(Number(tournamentId), Number(teamId));

    if (!success) {
        return { code: 404, data: { message: 'Inscripción no encontrada' } };
    }

    return { code: 200, data: { message: 'Equipo dado de baja del torneo correctamente' } };
});