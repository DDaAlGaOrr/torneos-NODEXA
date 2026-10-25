import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as statsService from '../services/player_stats.service';
import * as statsModel from '../model/player_stats.model';
import { checkTeamAccess } from '../services/player.service';
import { verifyTournamentOwnership } from '../model/tournament_team.model';

const DENIED = { code: 403, data: { message: 'Acceso denegado' } };

/** GET /players/:id/stats — ficha del jugador: totales, por torneo, goles/tarjetas y sanciones */
export const getPlayerStats = catchAsync(async (req: AuthRequest, res) => {
    const result = await statsService.getPlayerStats(Number(req.params.id), req.user.organization_id);
    return result ? { code: 200, data: result } : { code: 404, data: { message: 'Jugador no encontrado' } };
});

/** GET /teams/:id/stats — totales del equipo por torneo */
export const getTeamStats = catchAsync(async (req: AuthRequest, res) => {
    const teamId = Number(req.params.id);
    if (!(await checkTeamAccess(teamId, req.user.organization_id))) return DENIED;
    return { code: 200, data: await statsService.getTeamStats(teamId) };
});

/** Verificación común de las estadísticas de un torneo */
const tournamentStat = (load: (tournamentId: number) => Promise<any>) =>
    catchAsync(async (req: AuthRequest, res) => {
        const tournamentId = Number(req.params.tournamentId);
        if (!(await verifyTournamentOwnership(tournamentId, req.user.organization_id))) return DENIED;
        return { code: 200, data: await load(tournamentId) };
    });

export const getTournamentTeamStats = tournamentStat(statsService.getTournamentTeamStats);
export const getGoalkeepers = tournamentStat(statsService.getGoalkeepers);

/** PUT /sanctions/:id  { status: 'appealed' | 'pending' } */
export const setSanctionStatus = catchAsync(async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const status = req.body?.status;
    if (status !== 'appealed' && status !== 'pending') {
        return { code: 400, data: { message: 'status debe ser "appealed" (apelada) o "pending" (quitar apelación)' } };
    }
    const sanction = await statsModel.findSanction(id, req.user.organization_id);
    if (!sanction) return { code: 404, data: { message: 'Sanción no encontrada' } };

    await statsService.setSanctionStatus(id, Number(sanction.tournament_id), status, req.user);
    return { code: 200, data: { message: status === 'appealed' ? 'Sanción apelada: el jugador puede jugar' : 'Apelación retirada' } };
});
