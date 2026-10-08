import pool from '../conection/index';
import { RowDataPacket } from 'mysql2';

export async function getBracketMatches(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT 
            r.id as round_id,
            r.name as round_name,
            r.round_order,
            m.id as match_id,
            m.status,
            m.scheduled_at,
            m.score_home,
            m.score_away,
            m.next_match_id,
            m.next_match_position,
            t1.id as home_team_id,
            t1.name as home_team_name,
            t1.logo_url as home_team_logo,
            t2.id as away_team_id,
            t2.name as away_team_name,
            t2.logo_url as away_team_logo
         FROM rounds r
         INNER JOIN matches m ON r.id = m.round_id
         LEFT JOIN teams t1 ON m.home_team_id = t1.id
         LEFT JOIN teams t2 ON m.away_team_id = t2.id
         WHERE r.tournament_id = ?
         ORDER BY r.round_order ASC, m.id ASC`,
        [tournamentId]
    );
    return rows;
}