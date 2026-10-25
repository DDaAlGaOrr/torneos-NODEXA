import * as dashboardModel from '../model/dashboard.model';
import { getTournamentStandingsByGroup } from './standing.service';
import { getTournamentTeamStats } from './player_stats.service';

/** Equipos por grupo que se muestran en la tabla rápida */
const QUICK_TABLE_ROWS = 5;

/**
 * Resumen del Dashboard. Sin `tournamentId` considera todos los torneos activos de la liga
 * (los que no están finalizados, archivados ni cancelados); la tabla rápida y los destacados
 * se calculan sobre el torneo con resultados más recientes.
 */
export async function getSummary(organizationId: number, tournamentId: number | null) {
    const tournaments = await dashboardModel.findTournaments(organizationId);
    if (tournamentId !== null && !(await dashboardModel.tournamentBelongs(tournamentId, organizationId))) return null;

    const ids = tournamentId !== null ? [tournamentId] : tournaments.filter(t => t.active).map(t => t.id);
    const featuredId = tournamentId ?? (await dashboardModel.featuredTournament(ids));

    const [counters, live, today, upcoming, recent, knockouts, scorers] = await Promise.all([
        dashboardModel.counters(organizationId, ids),
        dashboardModel.liveMatches(ids),
        dashboardModel.todayMatches(ids),
        dashboardModel.upcomingMatches(ids),
        dashboardModel.recentResults(ids),
        dashboardModel.upcomingKnockouts(ids),
        dashboardModel.topScorers(ids),
    ]);

    let featured = null;
    if (featuredId) {
        const [groups, teamStats, perRound] = await Promise.all([
            getTournamentStandingsByGroup(featuredId),
            getTournamentTeamStats(featuredId),
            dashboardModel.goalsPerRound(featuredId),
        ]);
        const played = teamStats.filter(t => t.PJ > 0);
        const pick = (sorter: (a: any, b: any) => number) => (played.length ? [...played].sort(sorter)[0] : null);
        featured = {
            tournament_id: featuredId,
            tournament_name: tournaments.find(t => t.id === featuredId)?.name ?? null,
            table: groups.map(g => ({ ...g, total: g.standings.length, standings: g.standings.slice(0, QUICK_TABLE_ROWS) })),
            highlights: {
                most_goals: pick((a, b) => b.GF - a.GF || b.DG - a.DG),
                least_conceded: pick((a, b) => a.GC - b.GC || b.DG - a.DG),
                fair_play: pick((a, b) => a.fair_play - b.fair_play || a.red_cards - b.red_cards),
            },
            goals_per_round: perRound,
        };
    }

    return {
        scope: { tournament_id: tournamentId, tournaments_count: ids.length },
        tournaments,
        counters,
        live,
        today,
        upcoming,
        recent,
        knockouts,
        top_scorers: scorers,
        featured,
        generated_at: new Date().toISOString(),
    };
}
