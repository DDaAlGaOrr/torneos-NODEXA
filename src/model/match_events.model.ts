import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function verifyMatchAccess(matchId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT m.id, m.home_team_id, m.away_team_id, m.status 
         FROM matches m
         INNER JOIN tournaments t ON m.tournament_id = t.id
         WHERE m.id = ? AND t.organization_id = ?`,
        [matchId, organizationId]
    );
    return rows.length > 0 ? rows[0] : null;
}

export async function addEvent(
    matchId: number, teamId: number, playerId: number | null,
    assistPlayerId: number | null, eventType: string, minute: number | null,
    matchInfo: any
) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [result] = await connection.query<ResultSetHeader>(
            `INSERT INTO match_events 
             (match_id, team_id, player_id, assist_player_id, event_type, minute) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [matchId, teamId, playerId, assistPlayerId, eventType, minute]
        );

        if (eventType === 'goal') {
            const isHome = matchInfo.home_team_id === teamId;
            const scoreColumn = isHome ? 'score_home' : 'score_away';

            await connection.query(
                `UPDATE matches SET ${scoreColumn} = ${scoreColumn} + 1 WHERE id = ?`,
                [matchId]
            );
        }

        await connection.commit();
        return { id: result.insertId, event_type: eventType, team_id: teamId };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function getEventsByMatch(matchId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT e.id, e.event_type, e.minute, 
                t.name as team_name, 
                p.name as player_name, p.jersey_number,
                a.name as assist_player_name
         FROM match_events e
         INNER JOIN teams t ON e.team_id = t.id
         LEFT JOIN players p ON e.player_id = p.id
         LEFT JOIN players a ON e.assist_player_id = a.id
         WHERE e.match_id = ?
         ORDER BY e.minute ASC, e.id ASC`,
        [matchId]
    );
    return rows;
}