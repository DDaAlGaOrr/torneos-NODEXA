import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as bracketService from '../services/bracket.service';
import { verifyTournamentOwnership } from '../model/tournament_team.model';

export const getBracket = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    const organizationId = req.user.organization_id;

    const hasAccess = await verifyTournamentOwnership(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    const result = await bracketService.getTournamentBracket(Number(tournamentId));
    return { code: 200, data: result };
});