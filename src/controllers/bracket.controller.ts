import { catchAsync, AppError } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as bracketService from '../services/bracket.service';
import { verifyTournamentOwnership } from '../model/tournament_team.model';
import { logAudit } from '../utils/audit';
import { notifyChange } from '../utils/live';

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

export const generate = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    const organizationId = req.user.organization_id;

    const hasAccess = await verifyTournamentOwnership(Number(tournamentId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado al torneo' } };
    }

    const body = req.body ?? {};
    if (body.source !== undefined && !['groups', 'teams'].includes(body.source)) {
        return { code: 400, data: { message: 'source debe ser "groups" o "teams"' } };
    }
    if (body.team_ids !== undefined && !Array.isArray(body.team_ids)) {
        return { code: 400, data: { message: 'team_ids debe ser una lista de IDs' } };
    }

    try {
        const result = await bracketService.generateBracket(Number(tournamentId), {
            source: body.source,
            qualifiers_per_group: body.qualifiers_per_group,
            team_ids: body.team_ids,
            manual_order: body.manual_order,
            dry_run: body.dry_run === true,
            replace: body.replace === true,
            force: body.force === true,
        });
        if (!result.dry_run) {
            const { bracket, ...summary } = result as any;
            await logAudit(req.user, { action: 'bracket.generate', entityType: 'tournament', entityId: Number(tournamentId), newValues: summary });
            notifyChange({ kind: 'bracket', organization_id: organizationId, tournament_id: Number(tournamentId) });
        }
        return { code: result.dry_run ? 200 : 201, data: result };
    } catch (error: any) {
        if (error instanceof AppError) return { code: error.statusCode, data: { message: error.message } };
        if (error.code === 'ROUND_ORDER_OVERFLOW') return { code: 400, data: { message: error.message } };
        throw error;
    }
});
