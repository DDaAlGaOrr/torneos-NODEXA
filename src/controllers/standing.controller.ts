import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as standingService from '../services/standing.service';
import { verifyTournamentOwnership } from '../model/tournament_team.model';

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