import pool from '../conection/index';
import { RowDataPacket } from 'mysql2';

// Estadísticas por jugador y por equipo. Los números salen de player_tournament_stats (que se recalcula
// con cada cambio de resultados) y de los partidos finalizados.

export async function findPlayer(playerId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT p.id, p.name, p.jersey_number, p.position, p.status, p.photo_url,
                t.id AS team_id, t.name AS team_name, t.primary_color AS team_color, (t.captain_player_id = p.id) AS is_captain
         FROM players p INNER JOIN teams t ON t.id = p.team_id AND t.organization_id = ?
         WHERE p.id = ?`,
        [organizationId, playerId]
    );
    return rows[0] ? { ...rows[0], is_captain: !!Number(rows[0].is_captain) } : null;
}

export async function findPlayerTournamentStats(playerId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT st.tournament_id, t.name AS tournament_name, t.status AS tournament_status,
                st.goals, st.assists, st.yellow_cards, st.red_cards
         FROM player_tournament_stats st INNER JOIN tournaments t ON t.id = st.tournament_id
         WHERE st.player_id = ?
         ORDER BY t.id DESC`,
        [playerId]
    );
    return rows;
}

/** Goles, asistencias y tarjetas del jugador, partido por partido */
export async function findPlayerEvents(playerId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT e.id, e.event_type, e.minute, (e.assist_player_id = ? AND (e.player_id IS NULL OR e.player_id <> ?)) AS as_assist,
                m.id AS match_id, m.tournament_id, t.name AS tournament_name, r.name AS round_name,
                DATE_FORMAT(m.scheduled_at, '%Y-%m-%d %H:%i') AS scheduled_local, m.status AS match_status,
                IF(m.home_team_id = e.team_id, ta.name, th.name) AS rival_name,
                m.score_home, m.score_away, (m.home_team_id = e.team_id) AS is_home
         FROM match_events e
         INNER JOIN matches m ON m.id = e.match_id AND m.status <> 'cancelled'
         INNER JOIN tournaments t ON t.id = m.tournament_id
         INNER JOIN rounds r ON r.id = m.round_id
         LEFT JOIN teams th ON th.id = m.home_team_id
         LEFT JOIN teams ta ON ta.id = m.away_team_id
         WHERE (e.player_id = ? OR (e.assist_player_id = ? AND e.event_type = 'goal'))
           AND e.event_type IN ('goal', 'own_goal', 'yellow_card', 'red_card')
         ORDER BY m.scheduled_at DESC, m.id DESC, e.minute ASC`,
        [playerId, playerId, playerId, playerId]
    );
    return rows.map(r => ({ ...r, as_assist: !!Number(r.as_assist), is_home: !!Number(r.is_home) }));
}

export async function findPlayerSanctions(playerId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT s.id, s.reason, s.matches_suspended, s.status, s.created_at, s.match_id,
                t.id AS tournament_id, t.name AS tournament_name
         FROM sanctions s INNER JOIN tournaments t ON t.id = s.tournament_id
         WHERE s.player_id = ?
         ORDER BY s.created_at DESC`,
        [playerId]
    );
    return rows;
}

/** Jugadores del equipo con sus totales (de un torneo o de todos) */
export async function findTeamPlayersWithStats(teamId: number, tournamentId: number | null) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT p.id, p.name, p.jersey_number, p.position, p.status, p.photo_url,
                COALESCE(SUM(st.goals), 0) AS goals, COALESCE(SUM(st.assists), 0) AS assists,
                COALESCE(SUM(st.yellow_cards), 0) AS yellow_cards, COALESCE(SUM(st.red_cards), 0) AS red_cards
         FROM players p
         LEFT JOIN player_tournament_stats st ON st.player_id = p.id AND (? IS NULL OR st.tournament_id = ?)
         WHERE p.team_id = ?
         GROUP BY p.id
         ORDER BY p.name ASC`,
        [tournamentId, tournamentId, teamId]
    );
    return rows.map(r => ({
        ...r, goals: Number(r.goals), assists: Number(r.assists), yellow_cards: Number(r.yellow_cards), red_cards: Number(r.red_cards),
    }));
}

/**
 * Totales de equipos en un torneo (todas las fases, partidos finalizados): PJ, G/E/P, GF, GC y tarjetas.
 * Con `teamId` se limita a ese equipo; sin `tournamentId`, agrupa por torneo.
 */
export async function findTeamTotals(opts: { tournamentId?: number; teamId?: number }) {
    const where: string[] = ["m.status = 'finished'"];
    const params: any[] = [];
    if (opts.tournamentId) { where.push('m.tournament_id = ?'); params.push(opts.tournamentId); }
    if (opts.teamId) { where.push('x.team_id = ?'); params.push(opts.teamId); }

    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT x.team_id, tm.name AS team_name, tm.primary_color, m.tournament_id, t.name AS tournament_name,
                COUNT(*) AS PJ,
                SUM(x.gf > x.gc) AS PG, SUM(x.gf = x.gc) AS PE, SUM(x.gf < x.gc) AS PP,
                SUM(x.gf) AS GF, SUM(x.gc) AS GC, SUM(x.gc = 0) AS clean_sheets
         FROM (
            SELECT id AS match_id, home_team_id AS team_id, score_home AS gf, score_away AS gc FROM matches
            UNION ALL
            SELECT id, away_team_id, score_away, score_home FROM matches
         ) x
         INNER JOIN matches m ON m.id = x.match_id
         INNER JOIN teams tm ON tm.id = x.team_id
         INNER JOIN tournaments t ON t.id = m.tournament_id
         WHERE ${where.join(' AND ')}
         GROUP BY x.team_id, m.tournament_id`,
        params
    );
    return rows.map((r): any => ({
        ...r,
        PJ: Number(r.PJ), PG: Number(r.PG), PE: Number(r.PE), PP: Number(r.PP),
        GF: Number(r.GF), GC: Number(r.GC), DG: Number(r.GF) - Number(r.GC), clean_sheets: Number(r.clean_sheets),
    }));
}

/** Tarjetas por equipo en un torneo (todas las fases, partidos no cancelados) */
export async function findTeamCards(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT e.team_id, SUM(e.event_type = 'yellow_card') AS yellows, SUM(e.event_type = 'red_card') AS reds
         FROM match_events e INNER JOIN matches m ON m.id = e.match_id AND m.tournament_id = ? AND m.status <> 'cancelled'
         WHERE e.event_type IN ('yellow_card', 'red_card')
         GROUP BY e.team_id`,
        [tournamentId]
    );
    return new Map(rows.map(r => [Number(r.team_id), { yellows: Number(r.yellows), reds: Number(r.reds) }]));
}

/** Equipos inscritos (confirmados) del torneo */
export async function findConfirmedTeams(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT t.id AS team_id, t.name AS team_name, t.primary_color
         FROM tournament_teams tt INNER JOIN teams t ON t.id = tt.team_id
         WHERE tt.tournament_id = ? AND tt.status = 'confirmed'`,
        [tournamentId]
    );
    return rows;
}

/** Jugadores con posición de portero en los equipos confirmados del torneo */
export async function findGoalkeepers(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT p.id AS player_id, p.name AS player_name, p.jersey_number, p.team_id
         FROM players p
         INNER JOIN tournament_teams tt ON tt.team_id = p.team_id AND tt.tournament_id = ? AND tt.status = 'confirmed'
         WHERE p.status <> 'inactive'
           AND (LOWER(p.position) LIKE 'port%' OR LOWER(p.position) IN ('gk', 'goalkeeper', 'arquero', 'por'))`,
        [tournamentId]
    );
    return rows;
}

export async function findTopScorerOfTeam(teamId: number, tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT p.id AS player_id, p.name AS player_name, st.goals
         FROM player_tournament_stats st INNER JOIN players p ON p.id = st.player_id
         WHERE p.team_id = ? AND st.tournament_id = ? AND st.goals > 0
         ORDER BY st.goals DESC, p.name LIMIT 1`,
        [teamId, tournamentId]
    );
    return rows[0] ?? null;
}

export async function findSanction(sanctionId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT s.id, s.status, s.tournament_id FROM sanctions s
         INNER JOIN tournaments t ON t.id = s.tournament_id AND t.organization_id = ?
         WHERE s.id = ?`,
        [organizationId, sanctionId]
    );
    return rows[0] ?? null;
}
