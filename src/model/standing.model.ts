import pool from '../conection/index';
import { RowDataPacket } from 'mysql2';

export async function calculateStandings(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT 
            t.id as team_id,
            t.name as team_name,
            t.short_name,
            t.logo_url,
            COUNT(m.id) as PJ,
            SUM(CASE WHEN (m.home_team_id = t.id AND m.score_home > m.score_away) OR (m.away_team_id = t.id AND m.score_away > m.score_home) THEN 1 ELSE 0 END) as PG,
            SUM(CASE WHEN m.score_home = m.score_away THEN 1 ELSE 0 END) as PE,
            SUM(CASE WHEN (m.home_team_id = t.id AND m.score_home < m.score_away) OR (m.away_team_id = t.id AND m.score_away < m.score_home) THEN 1 ELSE 0 END) as PP,
            COALESCE(SUM(CASE WHEN m.home_team_id = t.id THEN m.score_home ELSE m.score_away END), 0) as GF,
            COALESCE(SUM(CASE WHEN m.home_team_id = t.id THEN m.score_away ELSE m.score_home END), 0) as GC,
            COALESCE(SUM(CASE 
                WHEN m.home_team_id = t.id THEN CAST(m.score_home AS SIGNED) - CAST(m.score_away AS SIGNED) 
                ELSE CAST(m.score_away AS SIGNED) - CAST(m.score_home AS SIGNED) 
            END), 0) as DG,
            SUM(CASE WHEN (m.home_team_id = t.id AND m.score_home > m.score_away) OR (m.away_team_id = t.id AND m.score_away > m.score_home) THEN 3
                     WHEN m.score_home = m.score_away THEN 1 
                     ELSE 0 END) as Puntos
        FROM tournament_teams tt
        INNER JOIN teams t ON tt.team_id = t.id
        LEFT JOIN matches m ON (m.home_team_id = t.id OR m.away_team_id = t.id) 
            AND m.tournament_id = tt.tournament_id 
            AND m.status = 'finished'
        WHERE tt.tournament_id = ? AND tt.status = 'confirmed'
        GROUP BY t.id
        ORDER BY Puntos DESC, DG DESC, GF DESC, team_name ASC`,
        [tournamentId]
    );
    return rows;
}