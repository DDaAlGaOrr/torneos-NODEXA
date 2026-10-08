import pool from '../conection/index';
import { RowDataPacket } from 'mysql2';

export async function getTopScorers(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT 
            p.id as player_id,
            p.name as player_name,
            p.jersey_number,
            p.photo_url,
            t.id as team_id,
            t.name as team_name,
            t.logo_url,
            COUNT(e.id) as goals
         FROM match_events e
         INNER JOIN players p ON e.player_id = p.id
         INNER JOIN teams t ON e.team_id = t.id
         INNER JOIN matches m ON e.match_id = m.id
         WHERE m.tournament_id = ? AND e.event_type = 'goal'
         GROUP BY p.id, t.id
         ORDER BY goals DESC, player_name ASC`,
        [tournamentId]
    );
    return rows;
}

export async function getFairPlay(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT 
            p.id as player_id,
            p.name as player_name,
            p.jersey_number,
            t.id as team_id,
            t.name as team_name,
            SUM(CASE WHEN e.event_type = 'yellow_card' THEN 1 ELSE 0 END) as yellow_cards,
            SUM(CASE WHEN e.event_type = 'red_card' THEN 1 ELSE 0 END) as red_cards,
            SUM(CASE WHEN e.event_type = 'yellow_card' THEN 1 
                     WHEN e.event_type = 'red_card' THEN 3 
                     ELSE 0 END) as penalty_points
         FROM match_events e
         INNER JOIN players p ON e.player_id = p.id
         INNER JOIN teams t ON e.team_id = t.id
         INNER JOIN matches m ON e.match_id = m.id
         WHERE m.tournament_id = ? AND e.event_type IN ('yellow_card', 'red_card')
         GROUP BY p.id, t.id
         ORDER BY penalty_points DESC, red_cards DESC, yellow_cards DESC`,
        [tournamentId]
    );
    return rows;
}