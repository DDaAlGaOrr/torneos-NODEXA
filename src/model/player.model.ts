import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { buildSet } from '../utils/fields';

export const PLAYER_UPDATABLE = ['name', 'jersey_number', 'position', 'status', 'photo_url'] as const;

export async function verifyTeamOwnership(teamId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM teams WHERE id = ? AND organization_id = ?',
        [teamId, organizationId]
    );
    return rows.length > 0;
}

export async function isCoachOfTeam(userId: number, teamId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT team_id FROM team_coaches WHERE user_id = ? AND team_id = ?',
        [userId, teamId]
    );
    return rows.length > 0;
}

export async function create(
    teamId: number, name: string, jerseyNumber: string, position: string
) {
    const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO players (team_id, name, jersey_number, position) VALUES (?, ?, ?, ?)',
        [teamId, name, jerseyNumber, position]
    );
    return { id: result.insertId, team_id: teamId, name, jersey_number: jerseyNumber, position };
}

export async function findAllByTeam(teamId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, name, jersey_number, position, status, photo_url FROM players WHERE team_id = ? ORDER BY name ASC',
        [teamId]
    );
    return rows;
}

export async function update(id: number, teamId: number, updateFields: any) {
    const { keys, setClause, values } = buildSet(updateFields, PLAYER_UPDATABLE);
    if (keys.length === 0) return false;

    // team_id en el WHERE: el jugador debe pertenecer al equipo ya validado
    const [result] = await pool.query<ResultSetHeader>(
        `UPDATE players SET ${setClause} WHERE id = ? AND team_id = ?`,
        [...values, id, teamId]
    );
    return result.affectedRows > 0;
}

export async function remove(id: number, teamId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM players WHERE id = ? AND team_id = ?',
        [id, teamId]
    );
    return result.affectedRows > 0;
}

/** ¿Ya hay otro jugador del equipo con ese número? (excludeId = jugador que se está editando) */
export async function jerseyTaken(teamId: number, jerseyNumber: string, excludeId?: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM players WHERE team_id = ? AND jersey_number = ? AND id <> ?',
        [teamId, jerseyNumber, excludeId ?? 0]
    );
    return rows.length > 0;
}

/** Eventos de partido (goles, tarjetas...) ligados al jugador. */
export async function countEvents(playerId: number, teamId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as total
         FROM match_events e
         INNER JOIN players p ON p.id = ?  AND p.team_id = ?
         WHERE e.player_id = p.id OR e.assist_player_id = p.id`,
        [playerId, teamId]
    );
    return Number(rows[0].total);
}
