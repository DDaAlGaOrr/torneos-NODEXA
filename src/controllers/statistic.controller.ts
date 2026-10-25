import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as statisticService from '../services/statistic.service';
import { verifyTournamentOwnership } from '../model/tournament_team.model';

/** Todas las estadísticas comparten la misma verificación de acceso. */
const tournamentStat = (load: (tournamentId: number) => Promise<any>) =>
    catchAsync(async (req: AuthRequest, res) => {
        const { tournamentId } = req.params;
        const organizationId = req.user.organization_id;

        const hasAccess = await verifyTournamentOwnership(Number(tournamentId), organizationId);
        if (!hasAccess) {
            return { code: 403, data: { message: 'Acceso denegado al torneo' } };
        }

        return { code: 200, data: await load(Number(tournamentId)) };
    });

export const getTopScorers = tournamentStat(statisticService.getTournamentTopScorers);
export const getTopAssists = tournamentStat(statisticService.getTournamentTopAssists);
export const getFairPlay = tournamentStat(statisticService.getTournamentFairPlay);
export const getSanctions = tournamentStat(statisticService.getTournamentSanctions);
