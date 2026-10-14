import * as bracketModel from '../model/bracket.model';
import * as groupModel from '../model/group.model';
import * as standingService from './standing.service';
import { AppError } from '../middlewares/error.handler';
import { buildBracketPlan, slotsFromGroups, slotsFromSeeds, roundNameFor, Qualifier } from '../utils/bracket';

export async function getTournamentBracket(tournamentId: number) {
    const rows = await bracketModel.getBracketMatches(tournamentId);

    const roundsMap = new Map();

    rows.forEach(row => {
        if (!roundsMap.has(row.round_id)) {
            roundsMap.set(row.round_id, {
                round_id: row.round_id,
                round_name: row.round_name,
                round_order: row.round_order,
                matches: []
            });
        }
        
        if (row.match_id) {
            roundsMap.get(row.round_id).matches.push({
                id: row.match_id,
                status: row.status,
                scheduled_at: row.scheduled_at,
                score_home: row.score_home,
                score_away: row.score_away,
                next_match_id: row.next_match_id,
                next_match_position: row.next_match_position,
                home_team: row.home_team_id ? {
                    id: row.home_team_id,
                    name: row.home_team_name,
                    logo_url: row.home_team_logo
                } : null,
                away_team: row.away_team_id ? {
                    id: row.away_team_id,
                    name: row.away_team_name,
                    logo_url: row.away_team_logo
                } : null
            });
        }
    });

    return Array.from(roundsMap.values());
}

export interface GenerateOptions {
    source?: 'groups' | 'teams';
    qualifiers_per_group?: number;
    team_ids?: number[];
    manual_order?: Record<string, number[]>;   // group_id -> team_ids en el orden final deseado
    dry_run?: boolean;
    replace?: boolean;
    force?: boolean;
}

/**
 * Genera la eliminatoria. Dos orígenes:
 *  - 'groups': toma a los mejores de cada grupo según la tabla (cruce clásico 1A-2B, 1B-2A...).
 *  - 'teams': siembra directa de equipos (por defecto, orden de inscripción; o `team_ids` en orden de seed).
 * Con dry_run devuelve el plan sin guardar nada.
 */
export async function generateBracket(tournamentId: number, options: GenerateOptions) {
    const warnings: string[] = [];
    const dryRun = options.dry_run === true;
    const force = options.force === true;

    const groups = await groupModel.findAllByTournament(tournamentId);
    const source = options.source ?? (groups.length > 0 ? 'groups' : 'teams');

    let slots: (number | null)[];
    let method: string;

    if (source === 'groups') {
        if (groups.length === 0) throw new AppError(400, 'El torneo no tiene grupos; crea los grupos o usa source: "teams"');
        const perGroup = options.qualifiers_per_group ?? 2;
        if (!Number.isInteger(perGroup) || perGroup < 1) throw new AppError(400, 'qualifiers_per_group debe ser un entero mayor o igual a 1');

        const small = groups.filter(g => g.teams.length < perGroup);
        if (small.length > 0) {
            throw new AppError(400, `Estos grupos tienen menos de ${perGroup} equipos: ${small.map(g => g.name).join(', ')}`);
        }

        const pending = await bracketModel.countPendingGroupMatches(tournamentId);
        if (pending > 0) {
            const msg = `Quedan ${pending} partido(s) de fase de grupos sin finalizar`;
            if (dryRun || force) warnings.push(msg);
            else throw new AppError(409, `${msg}. Finalízalos o usa force: true`);
        }

        const standings = await standingService.getTournamentStandingsByGroup(tournamentId);
        const ordered: Qualifier[][] = [];
        for (const g of groups) {
            const block = standings.find(s => s.group_id === g.id);
            let rows: any[] = block ? block.standings : [];
            const manual = options.manual_order?.[String(g.id)];
            if (manual) {
                const known = new Set(rows.map(r => Number(r.team_id)));
                if (manual.some(id => !known.has(Number(id)))) {
                    throw new AppError(400, `manual_order del grupo ${g.name} incluye equipos que no pertenecen al grupo`);
                }
                const rest = rows.filter(r => !manual.map(Number).includes(Number(r.team_id)));
                rows = [...manual.map(id => rows.find(r => Number(r.team_id) === Number(id))), ...rest];
            } else if (rows.length > perGroup) {
                const a = rows[perGroup - 1], b = rows[perGroup];
                if (Number(a.Puntos) === Number(b.Puntos) && Number(a.DG) === Number(b.DG) && Number(a.GF) === Number(b.GF)) {
                    const msg = `Empate en el límite de clasificación del ${g.name} (${a.team_name} y ${b.team_name}): define el orden con manual_order`;
                    if (dryRun || force) warnings.push(msg);
                    else throw new AppError(409, msg);
                }
            }
            ordered.push(rows.slice(0, perGroup).map(r => ({
                team_id: Number(r.team_id), group_id: g.id,
                Puntos: Number(r.Puntos), DG: Number(r.DG), GF: Number(r.GF),
            })));
        }

        const result = slotsFromGroups(ordered, perGroup);
        slots = result.slots;
        method = result.method === 'cross' ? 'cruce clásico entre grupos' : 'siembra global por posición en grupo';
        if (result.method === 'seeded') {
            warnings.push('Con este número de grupos se usa siembra global; revisa que no haya cruces entre equipos del mismo grupo en la primera ronda');
        }
    } else {
        const confirmed = await bracketModel.confirmedTeamIds(tournamentId);
        let seeds = confirmed;
        if (options.team_ids) {
            const unique = new Set(options.team_ids.map(Number));
            if (unique.size !== options.team_ids.length) throw new AppError(400, 'team_ids contiene equipos repetidos');
            if (options.team_ids.some(id => !confirmed.includes(Number(id)))) {
                throw new AppError(400, 'team_ids incluye equipos que no están inscritos (confirmados) en el torneo');
            }
            seeds = options.team_ids.map(Number);
        }
        if (seeds.length < 2) throw new AppError(400, 'Se necesitan al menos 2 equipos para generar la eliminatoria');
        slots = slotsFromSeeds(seeds);
        method = options.team_ids ? 'siembra por team_ids (el primero es el seed 1)' : 'siembra por orden de inscripción';
    }

    const plan = buildBracketPlan(slots);

    // ¿Ya existe un cuadro?
    const existing = await bracketModel.findBracketRounds(tournamentId);
    let replaceIds: number[] = [];
    if (existing.length > 0) {
        if (existing.some(r => r.started > 0)) {
            throw new AppError(409, 'La eliminatoria ya tiene partidos iniciados o finalizados; no se puede regenerar');
        }
        if (!options.replace) {
            if (dryRun) warnings.push('Ya existe una eliminatoria; para generar otra usa replace: true');
            else throw new AppError(409, 'Ya existe una eliminatoria sin partidos jugados. Usa replace: true para regenerarla');
        }
        replaceIds = existing.map(r => r.id);
    }

    const summary = {
        method,
        size: plan.size,
        byes: plan.byes,
        rounds: Array.from({ length: plan.levels }, (_, i) => ({
            level: i + 1,
            name: roundNameFor(plan.size / Math.pow(2, i)),
            matches: plan.matches.filter(m => m.level === i + 1).map(m => ({ key: m.key, home_team_id: m.home, away_team_id: m.away, next: m.nextKey, next_position: m.nextPosition })),
        })),
        warnings,
    };

    if (dryRun) return { dry_run: true, ...summary };

    await bracketModel.persistBracket(tournamentId, plan, options.replace ? replaceIds : []);
    return { dry_run: false, ...summary, bracket: await getTournamentBracket(tournamentId) };
}
