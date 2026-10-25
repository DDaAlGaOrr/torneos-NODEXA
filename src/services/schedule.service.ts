import * as scheduleModel from '../model/schedule.model';
import * as groupModel from '../model/group.model';
import * as bracketModel from '../model/bracket.model';
import { getRules } from '../model/recalc.model';
import { AppError } from '../middlewares/error.handler';
import { Actor } from '../utils/audit';
import { addDays, daySlots, mergeGroupRounds, roundRobin, toMinutes } from '../utils/round-robin';

export interface ScheduleOptions {
    double_round?: boolean;
    start_date?: string | null;        // AAAA-MM-DD de la jornada 1
    days_between_rounds?: number;      // por defecto 7 (una jornada por semana)
    times?: string[];                  // horarios de inicio 'HH:MM'
    field_ids?: number[];              // canchas a usar
    dry_run?: boolean;
    replace?: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Genera las jornadas "todos contra todos":
 *  - Con grupos: cada grupo juega su round-robin y la jornada k reúne la jornada k de todos los grupos.
 *  - Liga / mixto sin grupos: todos los equipos confirmados.
 * Si se indican fecha, horarios y canchas, reparte los partidos de cada jornada en los huecos libres
 * (sin chocar con partidos de otros torneos de la liga en la misma cancha).
 */
export async function generateSchedule(tournamentId: number, organizationId: number, options: ScheduleOptions, actor: Actor) {
    const warnings: string[] = [];
    const dryRun = options.dry_run === true;

    const tournament = await scheduleModel.findTournament(tournamentId, organizationId);
    if (!tournament) throw new AppError(404, 'Torneo no encontrado');
    if (tournament.format === 'bracket') {
        throw new AppError(400, 'El torneo es de eliminación directa: genera el cuadro desde Brackets');
    }

    // ── Validación de opciones ───────────────────────────────────────────────
    const days = options.days_between_rounds ?? 7;
    if (!Number.isInteger(days) || days < 1 || days > 60) throw new AppError(400, 'Los días entre jornadas deben ser un entero entre 1 y 60');
    const start = options.start_date || null;
    if (start && (!DATE_RE.test(start) || Number.isNaN(toMinutes(start)))) throw new AppError(400, 'La fecha de inicio debe tener el formato AAAA-MM-DD');
    const times = Array.from(new Set(options.times ?? []));
    if (times.some(t => !TIME_RE.test(t))) throw new AppError(400, 'Los horarios deben tener el formato HH:MM (24 h)');
    if (times.length > 0 && !start) throw new AppError(400, 'Para asignar horarios indica la fecha de inicio');
    const fieldIds = Array.from(new Set((options.field_ids ?? []).map(Number)));
    const fields = await scheduleModel.findOrgFields(fieldIds, organizationId);
    if (fields.length !== fieldIds.length) throw new AppError(400, 'Una o más canchas no pertenecen a tu liga');

    // ── Equipos por grupo ────────────────────────────────────────────────────
    const groups = await groupModel.findAllByTournament(tournamentId);
    let sources: { groupId: number | null; groupName: string | null; teamIds: number[] }[];
    if (groups.length > 0) {
        sources = groups.map(g => ({ groupId: g.id, groupName: g.name, teamIds: g.teams.map((t: any) => Number(t.team_id)) }));
        const small = sources.filter(s => s.teamIds.length < 2);
        if (small.length) warnings.push(`Grupos con menos de 2 equipos (sin partidos): ${small.map(s => s.groupName).join(', ')}`);
        const withoutGroup = (await groupModel.confirmedTeamIdsWithoutGroup(tournamentId)).length;
        if (withoutGroup > 0) warnings.push(`${withoutGroup} equipo(s) confirmado(s) sin grupo no entran al calendario`);
    } else {
        if (tournament.format === 'groups_knockout') {
            throw new AppError(400, 'El torneo es de grupos: primero haz el sorteo o crea los grupos');
        }
        sources = [{ groupId: null, groupName: null, teamIds: await bracketModel.confirmedTeamIds(tournamentId) }];
    }
    if (sources.every(s => s.teamIds.length < 2)) throw new AppError(400, 'Se necesitan al menos 2 equipos confirmados para generar jornadas');

    // ── Jornadas existentes ──────────────────────────────────────────────────
    const existing = await scheduleModel.findRounds(tournamentId);
    if (existing.some(r => r.type === 'bracket')) {
        throw new AppError(409, 'El torneo ya tiene eliminatoria; las jornadas de grupos deben generarse antes del cuadro');
    }
    const groupRounds = existing.filter(r => r.type === 'group');
    if (groupRounds.some(r => r.started > 0)) {
        throw new AppError(409, 'Ya hay partidos de jornadas jugados o con incidencias; no se puede regenerar el calendario');
    }
    if (groupRounds.length > 0 && !options.replace) {
        const msg = `El torneo ya tiene ${groupRounds.length} jornada(s) sin jugar; usa replace: true para reemplazarlas`;
        if (dryRun) warnings.push(msg); else throw new AppError(409, msg);
    }
    const replaceIds = groupRounds.map(r => r.id);

    // ── Cruces ───────────────────────────────────────────────────────────────
    const doubleRound = options.double_round === true;
    const merged = mergeGroupRounds(sources.map(s => ({ groupId: s.groupId, rounds: roundRobin(s.teamIds, doubleRound) })));
    const groupName = new Map(sources.map(s => [s.groupId, s.groupName]));

    // ── Fechas y horarios ────────────────────────────────────────────────────
    const duration = (await getRules(tournamentId)).match_duration_minutes;
    const lastDate = start ? addDays(start, (merged.length - 1) * days) : null;
    const busy = start && times.length && fieldIds.length
        ? await scheduleModel.findBusyMatches(organizationId, start, lastDate!, replaceIds)
        : [];
    const planned: { field_id: number; scheduled_at: string }[] = [];
    const overlaps = (list: { field_id: number; scheduled_at: string }[], f: number | null, at: string) =>
        f !== null && list.some(b => b.field_id === f && Math.abs(toMinutes(b.scheduled_at) - toMinutes(at)) < duration);

    const slotFields: (number | null)[] = fieldIds.length ? fieldIds : [null];
    let unscheduled = 0;
    const rounds = merged.map((pairings, k) => {
        const date = start ? addDays(start, k * days) : null;
        const slots = date && times.length
            ? daySlots(date, times, slotFields, (f, at) => overlaps(busy, f, at) || overlaps(planned, f, at))
            : [];
        const matches = pairings.map((p, i) => {
            const slot = slots[i] ?? null;
            if (slot?.field_id) planned.push({ field_id: slot.field_id, scheduled_at: slot.scheduled_at });
            if (times.length && !slot) unscheduled++;
            return {
                home: p.home, away: p.away, group_id: p.groupId,
                field_id: slot?.field_id ?? null, scheduled_at: slot?.scheduled_at ?? null,
            };
        });
        return { name: `Jornada ${k + 1}`, date, matches };
    });
    if (unscheduled > 0) {
        warnings.push(`${unscheduled} partido(s) quedaron sin horario: faltan horarios o canchas libres en su día. Prográmalos desde el calendario.`);
    }
    if (start && times.length === 0) warnings.push('Sin horarios: los partidos quedan sin fecha ni hora; prográmalos desde el calendario.');

    const names = await scheduleModel.findTeamNames(sources.flatMap(s => s.teamIds));
    const fieldName = new Map(fields.map(f => [f.id, f.name]));
    const summary = {
        double_round: doubleRound,
        rounds: rounds.length,
        matches: rounds.reduce((n, r) => n + r.matches.length, 0),
        unscheduled,
        warnings,
    };
    const preview = rounds.map(r => ({
        name: r.name,
        date: r.date,
        matches: r.matches.map(m => ({
            home_team_id: m.home, home_team: names.get(m.home) ?? null,
            away_team_id: m.away, away_team: names.get(m.away) ?? null,
            group_name: groupName.get(m.group_id) ?? null,
            field_id: m.field_id, field_name: m.field_id ? fieldName.get(m.field_id) ?? null : null,
            scheduled_at: m.scheduled_at,
        })),
    }));

    if (dryRun) return { dry_run: true, ...summary, preview };

    await scheduleModel.persistSchedule(tournamentId, rounds, options.replace ? replaceIds : [], actor, summary);
    return { dry_run: false, ...summary, preview };
}
