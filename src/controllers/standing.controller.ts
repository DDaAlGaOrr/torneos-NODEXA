import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as standingService from '../services/standing.service';
import { verifyTournamentOwnership } from '../model/tournament_team.model';
import { rebuildTournamentStandalone } from '../model/recalc.model';
import { logAudit } from '../utils/audit';

export const recalculate = catchAsync(async (req: AuthRequest, res) => {
    const tournamentId = Number(req.params.tournamentId);
    if (!(await verifyTournamentOwnership(tournamentId, req.user.organization_id))) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    const result = await rebuildTournamentStandalone(tournamentId);
    await logAudit(req.user, { action: 'tournament.recalculate', entityType: 'tournament', entityId: tournamentId, newValues: result });
    return { code: 200, data: { message: 'Tabla, estadísticas y sanciones recalculadas', ...result } };
});

export const getStandings = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    const organizationId = req.user.organization_id;

    const hasAccess = await verifyTournamentOwnership(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    const result = await standingService.getTournamentStandings(Number(tournamentId));
    return { code: 200, data: result };
});

export const getStandingsByGroup = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    const organizationId = req.user.organization_id;

    const hasAccess = await verifyTournamentOwnership(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    const result = await standingService.getTournamentStandingsByGroup(Number(tournamentId));
    return { code: 200, data: result };
});
