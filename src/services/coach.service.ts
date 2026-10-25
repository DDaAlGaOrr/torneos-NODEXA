import * as coachModel from '../model/coach.model';
import { getTournamentStandingsByGroup } from './standing.service';

export async function getMyTeams(userId: number, organizationId: number) {
    return await coachModel.findTeamsOfCoach(userId, organizationId);
}

/** Resumen del equipo: posición en cada torneo, próximos partidos, resultados y sanciones pendientes. */
export async function getTeamOverview(teamId: number, organizationId: number) {
    const team = await coachModel.findTeam(teamId, organizationId);
    if (!team) return null;

    const tournaments = await coachModel.findTournamentsOfTeam(teamId);
    const standings = await Promise.all(tournaments.map(async (t) => {
        const groups = await getTournamentStandingsByGroup(Number(t.id));
        const block = groups.find(g => g.standings.some((s: any) => Number(s.team_id) === teamId));
        const row = block?.standings.find((s: any) => Number(s.team_id) === teamId);
        return {
            tournament_id: Number(t.id), tournament_name: t.name, status: t.status, format: t.format,
            group_name: block?.group_name ?? null,
            teams_in_group: block?.standings.length ?? 0,
            position: row?.position ?? null,
            PJ: row?.PJ ?? 0, PG: row?.PG ?? 0, PE: row?.PE ?? 0, PP: row?.PP ?? 0,
            GF: row?.GF ?? 0, GC: row?.GC ?? 0, DG: row?.DG ?? 0, Puntos: row?.Puntos ?? 0,
        };
    }));

    const [upcoming, recent, sanctions] = await Promise.all([
        coachModel.findUpcomingMatches(teamId),
        coachModel.findRecentResults(teamId),
        coachModel.findPendingSanctions(teamId),
    ]);
    return { team, standings, upcoming, recent, sanctions };
}
