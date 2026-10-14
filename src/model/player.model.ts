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
