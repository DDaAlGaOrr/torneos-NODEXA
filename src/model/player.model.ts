import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

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

export async function update(id: number, updateFields: any) {
    const fields = Object.keys(updateFields);
    if (fields.length === 0) return false;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = Object.values(updateFields);

    const [result] = await pool.query<ResultSetHeader>(
        `UPDATE players SET ${setClause} WHERE id = ?`,
        [...values, id]
    );
    return result.affectedRows > 0;
}

export async function remove(id: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM players WHERE id = ?',
        [id]
    );
    return result.affectedRows > 0;
}