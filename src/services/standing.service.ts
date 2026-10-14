import * as standingModel from '../model/standing.model';

export async function getTournamentStandings(tournamentId: number) {
    return await standingModel.calculateStandings(tournamentId);
}
/** Tabla agrupada por grupo, con la posición de cada equipo dentro de su grupo. */
export async function getTournamentStandingsByGroup(tournamentId: number) {
    const rows = await standingModel.calculateStandings(tournamentId);
    const groups = new Map<string, any>();

    for (const row of rows) {
        const key = row.group_id === null ? 'none' : String(row.group_id);
        if (!groups.has(key)) {
            groups.set(key, { group_id: row.group_id, group_name: row.group_name, standings: [] });
        }
        const g = groups.get(key);
        g.standings.push({ position: g.standings.length + 1, ...row });
    }
    return Array.from(groups.values());
}
