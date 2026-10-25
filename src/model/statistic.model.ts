import pool from '../conection/index';
import { RowDataPacket } from 'mysql2';
import { TournamentRules } from '../utils/rules';

// Todas las lecturas salen de player_tournament_stats, que se recalcula al cambiar resultados (recalc.model).

const PLAYER_STATS_SELECT = `
    SELECT p.id as player_id, p.name as player_name, p.jersey_number, p.photo_url, p.position,
           t.id as team_id, t.name as team_name, t.logo_url,
           st.goals, st.assists, st.yellow_cards, st.red_cards
    FROM player_tournament_stats st
    INNER JOIN players p ON p.id = st.player_id
    INNER JOIN teams t ON t.id = p.team_id`;

export async function getTopScorers(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `${PLAYER_STATS_SELECT}
         WHERE st.tournament_id = ? AND st.goals > 0
         ORDER BY st.goals DESC, st.assists DESC, p.name ASC`,
        [tournamentId]
    );
    return rows;
}

export async function getTopAssists(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `${PLAYER_STATS_SELECT}
         WHERE st.tournament_id = ? AND st.assists > 0
         ORDER BY st.assists DESC, st.goals DESC, p.name ASC`,
        [tournamentId]
    );
    return rows;
}

/** Jugadores con tarjetas; penalty_points usa los puntos de fair play del torneo. */
export async function getFairPlay(tournamentId: number, rules: TournamentRules) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `${PLAYER_STATS_SELECT}
         WHERE st.tournament_id = ? AND (st.yellow_cards > 0 OR st.red_cards > 0)`,
        [tournamentId]
    );
    return rows
        .map((r): any => ({ ...r, penalty_points: r.yellow_cards * rules.fair_play.yellow + r.red_cards * rules.fair_play.red }))
        .sort((a, b) => b.penalty_points - a.penalty_points || b.red_cards - a.red_cards || b.yellow_cards - a.yellow_cards);
}

export async function getSanctions(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT s.id, s.reason, s.matches_suspended, s.status, s.created_at, s.match_id,
                p.id as player_id, p.name as player_name, p.jersey_number,
                t.id as team_id, t.name as team_name
         FROM sanctions s
         INNER JOIN players p ON p.id = s.player_id
         INNER JOIN teams t ON t.id = p.team_id
         WHERE s.tournament_id = ?
         ORDER BY FIELD(s.status, 'pending', 'appealed', 'served'), s.created_at DESC`,
        [tournamentId]
    );
    return rows;
}
