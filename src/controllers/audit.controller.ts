import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as auditModel from '../model/audit.model';

/** GET /audit-logs?entity_type=match&entity_id=5&action=match.finish&user_id=1&limit=50&offset=0 */
export const getAll = catchAsync(async (req: AuthRequest, res) => {
    const q = req.query as Record<string, string | undefined>;
    const int = (v: string | undefined) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : undefined);

    const result = await auditModel.findByOrganization(req.user.organization_id, {
        entity_type: q.entity_type || undefined,
        entity_id: int(q.entity_id),
        action: q.action || undefined,
        user_id: int(q.user_id),
        limit: Math.min(int(q.limit) ?? 50, 200),
        offset: int(q.offset) ?? 0,
    });
    return { code: 200, data: result };
});
