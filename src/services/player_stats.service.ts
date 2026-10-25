import pool from '../conection/index';
import * as statsModel from '../model/player_stats.model';
import { getRules, rebuildTournament } from '../model/recalc.model';
import { Actor, logAudit } from '../utils/audit';
import { notifyChange } from '../utils/live';

export async function getPlayerStats(playerId: number, organizationId: number) {
    const player = await statsModel.findPlayer(playerId, organizationId);
    if (!player) return null;
    const [tournaments, events, sanctions] = await Promise.all([
        statsModel.findPlayerTournamentStats(playerId),
        statsModel.findPlayerEvents(playerId),
        statsModel.findPlayerSanctions(playerId),
    ]);
    const totals = tournaments.reduce(
        (acc, t) => ({
            goals: acc.goals + Number(t.goals), assists: acc.assists + Number(t.assists),
            yellow_cards: acc.yellow_cards + Number(t.yellow_cards), red_cards: acc.red_cards + Number(t.red_cards),
        }),
        { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0 },
    );
    return { player, totals, tournaments, events, sanctions };
}

export async function getTeamPlayers(teamId: number, tournamentId: number | null) {
    return await statsModel.findTeamPlayersWithStats(teamId, tournamentId);
}

/** Totales del equipo por torneo (todas las fases) con su goleador */
export async function getTeamStats(teamId: number) {
    const totals = await statsModel.findTeamTotals({ teamId });
    return await Promise.all(totals.map(async (t) => ({
        ...t,
        top_scorer: await statsModel.findTopScorerOfTeam(teamId, Number(t.tournament_id)),
    })));
}

/**
 * Estadísticas por equipo del torneo: partidos, goles a favor y en contra, tarjetas y puntos de fair play
 * (menos = mejor). Sirve para "más goleador", "menos goleado" y fair play por equipo.
 */
export async function getTournamentTeamStats(tournamentId: number) {
    const [teams, totals, cards, rules] = await Promise.all([
        statsModel.findConfirmedTeams(tournamentId),
        statsModel.findTeamTotals({ tournamentId }),
        statsModel.findTeamCards(tournamentId),
        getRules(tournamentId),
    ]);
    return teams.map(t => {
        const tot = totals.find(x => Number(x.team_id) === Number(t.team_id));
        const c = cards.get(Number(t.team_id)) ?? { yellows: 0, reds: 0 };
        return {
            team_id: Number(t.team_id), team_name: t.team_name, primary_color: t.primary_color,
            PJ: tot?.PJ ?? 0, PG: tot?.PG ?? 0, PE: tot?.PE ?? 0, PP: tot?.PP ?? 0,
            GF: tot?.GF ?? 0, GC: tot?.GC ?? 0, DG: tot?.DG ?? 0, clean_sheets: tot?.clean_sheets ?? 0,
            yellow_cards: c.yellows, red_cards: c.reds,
            fair_play: c.yellows * rules.fair_play.yellow + c.reds * rules.fair_play.red,
        };
    });
}

/**
 * Porteros (aproximación: no hay alineaciones). A cada jugador con posición de portero se le atribuyen
 * los goles recibidos y las porterías en cero de su equipo en el torneo. Si un equipo tiene varios
 * porteros, todos comparten los números del equipo.
 */
export async function getGoalkeepers(tournamentId: number) {
    const [keepers, totals] = await Promise.all([
        statsModel.findGoalkeepers(tournamentId),
        statsModel.findTeamTotals({ tournamentId }),
    ]);
    const perTeam = new Map<number, number>();
    for (const k of keepers) perTeam.set(Number(k.team_id), (perTeam.get(Number(k.team_id)) ?? 0) + 1);
    return keepers
        .map(k => {
            const t = totals.find(x => Number(x.team_id) === Number(k.team_id));
            const pj = t?.PJ ?? 0;
            return {
                player_id: Number(k.player_id), player_name: k.player_name, jersey_number: k.jersey_number,
                team_id: Number(k.team_id), team_name: t?.team_name ?? null, primary_color: t?.primary_color ?? null,
                PJ: pj, goals_against: t?.GC ?? 0, clean_sheets: t?.clean_sheets ?? 0,
                goals_against_avg: pj ? Math.round(((t?.GC ?? 0) / pj) * 100) / 100 : null,
                shared_with: (perTeam.get(Number(k.team_id)) ?? 1) - 1,
            };
        })
        .sort((a, b) => (b.PJ > 0 ? 1 : 0) - (a.PJ > 0 ? 1 : 0)
            || (a.goals_against_avg ?? 99) - (b.goals_against_avg ?? 99)
            || b.clean_sheets - a.clean_sheets);
}

/** Apelar una sanción (no cuenta como suspensión) o quitar la apelación (vuelve a pendiente/cumplida). */
export async function setSanctionStatus(sanctionId: number, tournamentId: number, status: 'appealed' | 'pending', actor: Actor) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('UPDATE sanctions SET status = ? WHERE id = ?', [status, sanctionId]);
        // Al quitar la apelación, el recálculo decide si ya está cumplida
        await rebuildTournament(connection, tournamentId);
        await logAudit(actor, { action: 'sanction.status', entityType: 'sanction', entityId: sanctionId, newValues: { status } }, connection);
        await connection.commit();
        notifyChange({ kind: 'sanction', organization_id: actor.organization_id, tournament_id: tournamentId });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
