import pool from '../conection/index';
import { RowDataPacket } from 'mysql2';

/** Equipos donde el usuario es entrenador (dentro de su liga). */
export async function findTeamsOfCoach(userId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT t.id, t.name, t.short_name, t.primary_color, t.category_id, c.name AS category_name,
                t.contact_name, t.contact_email, t.contact_phone,
                t.captain_player_id, cp.name AS captain_name,
                (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) AS players_count
         FROM team_coaches tc
         INNER JOIN teams t ON t.id = tc.team_id AND t.organization_id = ?
         LEFT JOIN categories c ON c.id = t.category_id
         LEFT JOIN players cp ON cp.id = t.captain_player_id
         WHERE tc.user_id = ?
         ORDER BY t.name`,
        [organizationId, userId]
    );
    return rows.map(r => ({ ...r, players_count: Number(r.players_count) }));
}

export async function findTeam(teamId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT t.id, t.name, t.short_name, t.primary_color, c.name AS category_name,
                t.contact_name, t.contact_email, t.contact_phone, cp.name AS captain_name,
                (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) AS players_count
         FROM teams t
         LEFT JOIN categories c ON c.id = t.category_id
         LEFT JOIN players cp ON cp.id = t.captain_player_id
         WHERE t.id = ? AND t.organization_id = ?`,
        [teamId, organizationId]
    );
    return rows[0] ? { ...rows[0], players_count: Number(rows[0].players_count) } : null;
}

/** Torneos donde el equipo está inscrito (confirmado). */
export async function findTournamentsOfTeam(teamId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT t.id, t.name, t.status, t.format, s.slug AS sport_slug
         FROM tournament_teams tt
         INNER JOIN tournaments t ON t.id = tt.tournament_id
         INNER JOIN sports s ON s.id = t.sport_id
         WHERE tt.team_id = ? AND tt.status = 'confirmed' AND t.status NOT IN ('archived', 'cancelled')
         ORDER BY t.start_date IS NULL, t.start_date DESC, t.id DESC`,
        [teamId]
    );
    return rows;
}

const MATCH_SELECT = `
    SELECT m.id, m.tournament_id, t.name AS tournament_name, m.status,
           DATE_FORMAT(m.scheduled_at, '%Y-%m-%d %H:%i') AS scheduled_local,
           r.name AS round_name, r.type AS round_type, f.name AS field_name, f.maps_url,
           m.score_home, m.score_away, m.penalties_home, m.penalties_away, m.winner_team_id,
           (m.home_team_id = ?) AS is_home,
           IF(m.home_team_id = ?, ta.id, th.id) AS rival_id,
           IF(m.home_team_id = ?, ta.name, th.name) AS rival_name,
           IF(m.home_team_id = ?, ta.primary_color, th.primary_color) AS rival_color
    FROM matches m
    INNER JOIN tournaments t ON t.id = m.tournament_id
    INNER JOIN rounds r ON r.id = m.round_id
    LEFT JOIN teams th ON th.id = m.home_team_id
    LEFT JOIN teams ta ON ta.id = m.away_team_id
    LEFT JOIN fields f ON f.id = m.field_id`;

/** Próximos partidos: programados, en juego o suspendidos (los sin fecha al final). */
export async function findUpcomingMatches(teamId: number, limit = 10) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `${MATCH_SELECT}
         WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status IN ('scheduled', 'in_progress', 'postponed')
           AND (m.scheduled_at IS NULL OR m.scheduled_at >= CURDATE())
         ORDER BY m.status = 'in_progress' DESC, m.scheduled_at IS NULL, m.scheduled_at ASC
         LIMIT ?`,
        [teamId, teamId, teamId, teamId, teamId, teamId, limit]
    );
    return rows.map(r => ({ ...r, is_home: !!Number(r.is_home) }));
}

/** Últimos resultados con G/E/P desde el punto de vista del equipo. */
export async function findRecentResults(teamId: number, limit = 10) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `${MATCH_SELECT}
         WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'finished'
         ORDER BY m.finished_at DESC, m.id DESC
         LIMIT ?`,
        [teamId, teamId, teamId, teamId, teamId, teamId, limit]
    );
    return rows.map(r => {
        const isHome = !!Number(r.is_home);
        const own = isHome ? r.score_home : r.score_away;
        const rival = isHome ? r.score_away : r.score_home;
        const result = r.winner_team_id === null ? (own === rival ? 'E' : own > rival ? 'G' : 'P') : r.winner_team_id === teamId ? 'G' : 'P';
        return { ...r, is_home: isHome, own_score: own, rival_score: rival, result };
    });
}

/** Sanciones pendientes de los jugadores del equipo (no deben jugar). */
export async function findPendingSanctions(teamId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT s.id, s.reason, s.matches_suspended, s.status, s.created_at,
                p.id AS player_id, p.name AS player_name, p.jersey_number,
                t.id AS tournament_id, t.name AS tournament_name
         FROM sanctions s
         INNER JOIN players p ON p.id = s.player_id
         INNER JOIN tournaments t ON t.id = s.tournament_id
         WHERE p.team_id = ? AND s.status = 'pending'
         ORDER BY s.created_at DESC`,
        [teamId]
    );
    return rows;
}
