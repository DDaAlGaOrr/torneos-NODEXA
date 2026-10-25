import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as coachService from '../services/coach.service';
import { canManageTeam } from '../services/player.service';

/** GET /me/teams — equipos del entrenador que inició sesión */
export const getMyTeams = catchAsync(async (req: AuthRequest, res) => {
    return { code: 200, data: await coachService.getMyTeams(req.user.id, req.user.organization_id) };
});

/** GET /me/teams/:teamId/overview — el entrenador solo ve sus equipos; el administrador, cualquiera de su liga */
export const getTeamOverview = catchAsync(async (req: AuthRequest, res) => {
    const teamId = Number(req.params.teamId);
    if (!(await canManageTeam(req.user, teamId))) {
        return { code: 403, data: { message: 'No tienes acceso a este equipo' } };
    }
    const result = await coachService.getTeamOverview(teamId, req.user.organization_id);
    return result
        ? { code: 200, data: result }
        : { code: 404, data: { message: 'Equipo no encontrado' } };
});
