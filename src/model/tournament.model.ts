import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function create(
    organizationId: number, sportId: number, categoryId: number, name: string,
    description: string, format: string, maxTeams: number, rulesConfig: any,
    startDate: string, endDate: string
) {
    const rulesJson = rulesConfig ? JSON.stringify(rulesConfig) : null;

    const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO tournaments 
        (organization_id, sport_id, category_id, name, description, format, status, max_teams, rules_config, start_date, end_date) 
        VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
        [organizationId, sportId, categoryId, name, description, format, maxTeams, rulesJson, startDate, endDate]
    );
    return { id: result.insertId, name, format, status: 'draft' };
}

export async function findAllByOrganization(organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT t.id, t.name, t.format, t.status, t.start_date, t.end_date, 
                s.name as sport_name, c.name as category_name
         FROM tournaments t
         INNER JOIN sports s ON t.sport_id = s.id
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.organization_id = ?
         ORDER BY t.created_at DESC`,
        [organizationId]
    );
    return rows;
}

export async function update(id: number, organizationId: number, updateFields: any) {
    const fields = Object.keys(updateFields);
    if (fields.length === 0) return false;

    // Si viene rules_config como objeto, lo pasamos a string JSON
    if (updateFields.rules_config && typeof updateFields.rules_config === 'object') {
        updateFields.rules_config = JSON.stringify(updateFields.rules_config);
    }

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = Object.values(updateFields);

    const [result] = await pool.query<ResultSetHeader>(
        `UPDATE tournaments SET ${setClause} WHERE id = ? AND organization_id = ?`,
        [...values, id, organizationId]
    );
    return result.affectedRows > 0;
}

export async function remove(id: number, organizationId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM tournaments WHERE id = ? AND organization_id = ?',
        [id, organizationId]
    );
    return result.affectedRows > 0;
}