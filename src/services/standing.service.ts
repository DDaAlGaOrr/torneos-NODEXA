import * as standingModel from '../model/standing.model';
import { getRules } from '../model/recalc.model';
import { sortStandings } from '../utils/rules';

/** Tabla ordenada por grupo (sin grupo al final) y, dentro de cada grupo, por los criterios de desempate. */
export async function getTournamentStandings(tournamentId: number) {
    const groups = await getTournamentStandingsByGroup(tournamentId);
    return groups.flatMap(g => g.standings.map(({ position, ...row }) => row));
}

/** Tabla agrupada por grupo, con la posición de cada equipo dentro de su grupo. */
export async function getTournamentStandingsByGroup(tournamentId: number) {
    const [rows, rules] = await Promise.all([standingModel.findStandings(tournamentId), getRules(tournamentId)]);
    const groups = new Map<string, { group_id: number | null; group_name: string | null; standings: any[] }>();

    for (const row of rows) {
        const key = row.group_id === null ? 'none' : String(row.group_id);
        if (!groups.has(key)) {
            groups.set(key, { group_id: row.group_id, group_name: row.group_name, standings: [] });
        }
        groups.get(key)!.standings.push(row);
    }
    return Array.from(groups.values()).map(g => ({
        ...g,
        standings: sortStandings(g.standings, rules.tiebreakers).map((row, i) => ({ position: i + 1, ...row })),
    }));
}
