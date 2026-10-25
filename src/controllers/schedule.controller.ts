import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as scheduleService from '../services/schedule.service';

/**
 * POST /tournaments/:tournamentId/schedule/generate
 * Body: { double_round, start_date, days_between_rounds, times: ['10:00'], field_ids: [1], dry_run, replace }
 */
export const generate = catchAsync(async (req: AuthRequest, res) => {
    const b = req.body ?? {};
    if (b.times !== undefined && !Array.isArray(b.times)) return { code: 400, data: { message: 'times debe ser una lista de horarios' } };
    if (b.field_ids !== undefined && !Array.isArray(b.field_ids)) return { code: 400, data: { message: 'field_ids debe ser una lista de canchas' } };

    const result = await scheduleService.generateSchedule(Number(req.params.tournamentId), req.user.organization_id, {
        double_round: b.double_round === true,
        start_date: b.start_date ?? null,
        days_between_rounds: b.days_between_rounds === undefined ? undefined : Number(b.days_between_rounds),
        times: b.times,
        field_ids: b.field_ids,
        dry_run: b.dry_run === true,
        replace: b.replace === true,
    }, req.user);
    return { code: result.dry_run ? 200 : 201, data: result };
});
