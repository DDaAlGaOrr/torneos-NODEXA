import pool from '../conection/index';
import { RowDataPacket } from 'mysql2';

// Todas las consultas reciben la lista de torneos a considerar (`ids`); se usa [0] si está vacía
// para que `IN (?)` siga siendo SQL válido.
const scope = (ids: number[]) => (ids.length ? ids : [0]);

/** Torneos de la liga para el selector: activos primero, luego los terminados más recientes */
export async function findTournaments(organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, name, status, format
         FROM tournaments
         WHERE organization_id = ? AND status NOT IN ('archived', 'cancelled')
         ORDER BY status IN ('finished') ASC, status = 'in_progress' DESC, updated_at DESC, id DESC
         LIMIT 50`,
        [organizationId]
    );
    return rows.map(r => ({
        id: Number(r.id), name: String(r.name), status: String(r.status), format: String(r.format), active: r.status !== 'finished',
    }));
}

export async function tournamentBelongs(tournamentId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM tournaments WHERE id = ? AND organization_id = ?', [tournamentId, organizationId]
    );
    return rows.length > 0;
}

export async function counters(organizationId: number, ids: number[]) {
    const s = scope(ids);
    const [[r]] = await pool.query<RowDataPacket[]>(
        `SELECT
            (SELECT COUNT(*) FROM teams WHERE organization_id = ?) AS teams_total,
            (SELECT COUNT(DISTINCT team_id) FROM tournament_teams WHERE tournament_id IN (?) AND status = 'confirmed') AS teams_enrolled,
            (SELECT COUNT(*) FROM players p INNER JOIN teams t ON t.id = p.team_id WHERE t.organization_id = ?) AS players_total,
            (SELECT COUNT(*) FROM players p
               WHERE p.team_id IN (SELECT team_id FROM tournament_teams WHERE tournament_id IN (?) AND status = 'confirmed')) AS players_enrolled,
            (SELECT COUNT(*) FROM matches WHERE tournament_id IN (?) AND status <> 'cancelled') AS matches_total,
            (SELECT COUNT(*) FROM matches WHERE tournament_id IN (?) AND status = 'finished') AS matches_finished,
            (SELECT COUNT(*) FROM matches WHERE tournament_id IN (?) AND status <> 'cancelled' AND DATE(scheduled_at) = CURDATE()) AS today_total,
            (SELECT COUNT(*) FROM matches WHERE tournament_id IN (?) AND status = 'finished' AND DATE(scheduled_at) = CURDATE()) AS today_finished,
            (SELECT COUNT(*) FROM matches WHERE tournament_id IN (?) AND status = 'in_progress') AS live,
            (SELECT COUNT(*) FROM matches WHERE tournament_id IN (?) AND status IN ('scheduled', 'postponed') AND scheduled_at IS NULL) AS unscheduled,
            (SELECT COUNT(*) FROM match_events e INNER JOIN matches m ON m.id = e.match_id
               WHERE m.tournament_id IN (?) AND m.status <> 'cancelled' AND e.event_type IN ('goal', 'own_goal')) AS goals,
            (SELECT COUNT(*) FROM match_events e INNER JOIN matches m ON m.id = e.match_id
               WHERE m.tournament_id IN (?) AND m.status <> 'cancelled' AND e.event_type = 'yellow_card') AS yellow_cards,
            (SELECT COUNT(*) FROM match_events e INNER JOIN matches m ON m.id = e.match_id
               WHERE m.tournament_id IN (?) AND m.status <> 'cancelled' AND e.event_type = 'red_card') AS red_cards,
            (SELECT COUNT(*) FROM sanctions WHERE tournament_id IN (?) AND status = 'pending') AS pending_sanctions`,
        [organizationId, s, organizationId, s, s, s, s, s, s, s, s, s, s, s]
    );
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)]));
}

const MATCH_SELECT = `
    SELECT m.id, m.tournament_id, t.name AS tournament_name, m.status,
           DATE_FORMAT(m.scheduled_at, '%Y-%m-%d %H:%i') AS scheduled_local, m.started_at,
           r.name AS round_name, r.type AS round_type, r.round_order, f.name AS field_name,
           m.score_home, m.score_away, m.penalties_home, m.penalties_away, m.winner_team_id,
           m.home_team_id, th.name AS home_team, th.primary_color AS home_color,
           m.away_team_id, ta.name AS away_team, ta.primary_color AS away_color
    FROM matches m
    INNER JOIN tournaments t ON t.id = m.tournament_id
    INNER JOIN rounds r ON r.id = m.round_id
    LEFT JOIN teams th ON th.id = m.home_team_id
    LEFT JOIN teams ta ON ta.id = m.away_team_id
    LEFT JOIN fields f ON f.id = m.field_id`;

export async function liveMatches(ids: number[]) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `${MATCH_SELECT} WHERE m.tournament_id IN (?) AND m.status = 'in_progress' ORDER BY m.started_at, m.id`,
        [scope(ids)]
    );
    return rows;
}

export async function todayMatches(ids: number[]) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `${MATCH_SELECT}
         WHERE m.tournament_id IN (?) AND m.status <> 'cancelled' AND DATE(m.scheduled_at) = CURDATE()
         ORDER BY m.scheduled_at, f.name, m.id`,
        [scope(ids)]
    );
    return rows;
}

/** Próximos 7 días (sin contar hoy) */
export async function upcomingMatches(ids: number[], limit = 10) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `${MATCH_SELECT}
         WHERE m.tournament_id IN (?) AND m.status IN ('scheduled', 'postponed')
           AND m.scheduled_at >= CURDATE() + INTERVAL 1 DAY AND m.scheduled_at < CURDATE() + INTERVAL 8 DAY
         ORDER BY m.scheduled_at, m.id
         LIMIT ?`,
        [scope(ids), limit]
    );
    return rows;
}

export async function recentResults(ids: number[], limit = 8) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `${MATCH_SELECT} WHERE m.tournament_id IN (?) AND m.status = 'finished' ORDER BY m.finished_at DESC, m.id DESC LIMIT ?`,
        [scope(ids), limit]
    );
    return rows;
}

/** Partidos de eliminatoria por jugarse, de la ronda más temprana a la final */
export async function upcomingKnockouts(ids: number[], limit = 8) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `${MATCH_SELECT}
         WHERE m.tournament_id IN (?) AND r.type = 'bracket' AND m.status IN ('scheduled', 'postponed', 'in_progress')
         ORDER BY m.tournament_id, r.round_order, m.scheduled_at IS NULL, m.scheduled_at, m.id
         LIMIT ?`,
        [scope(ids), limit]
    );
    return rows;
}

/** Torneo "destacado" para la tabla rápida: el de resultados más recientes */
export async function featuredTournament(ids: number[]) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT m.tournament_id FROM matches m
         WHERE m.tournament_id IN (?) AND m.status IN ('finished', 'in_progress')
         ORDER BY m.status = 'in_progress' DESC, m.finished_at DESC LIMIT 1`,
        [scope(ids)]
    );
    return rows.length ? Number(rows[0].tournament_id) : ids[0] ?? null;
}

export async function topScorers(ids: number[], limit = 5) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT p.id AS player_id, p.name AS player_name, p.jersey_number,
                t.name AS team_name, t.primary_color, SUM(st.goals) AS goals, SUM(st.assists) AS assists
         FROM player_tournament_stats st
         INNER JOIN players p ON p.id = st.player_id
         INNER JOIN teams t ON t.id = p.team_id
         WHERE st.tournament_id IN (?)
         GROUP BY p.id
         HAVING goals > 0
         ORDER BY goals DESC, assists DESC, p.name
         LIMIT ?`,
        [scope(ids), limit]
    );
    return rows.map(r => ({ ...r, goals: Number(r.goals), assists: Number(r.assists) }));
}

/** Goles por jornada (partidos finalizados) del torneo destacado */
export async function goalsPerRound(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT r.id AS round_id, r.name AS round_name, r.round_order,
                COUNT(m.id) AS matches, COALESCE(SUM(m.score_home + m.score_away), 0) AS goals
         FROM rounds r
         INNER JOIN matches m ON m.round_id = r.id AND m.status = 'finished'
         WHERE r.tournament_id = ?
         GROUP BY r.id
         ORDER BY r.round_order`,
        [tournamentId]
    );
    return rows.map(r => ({ round_name: r.round_name, matches: Number(r.matches), goals: Number(r.goals) }));
}
