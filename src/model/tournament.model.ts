import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { buildSet } from '../utils/fields';

export const TOURNAMENT_UPDATABLE = [
    'sport_id', 'category_id', 'name', 'description', 'format', 'status',
    'max_teams', 'rules_config', 'start_date', 'end_date'
] as const;

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

const TOURNAMENT_SELECT = `
    SELECT t.id, t.name, t.description, t.format, t.status, t.max_teams,
           DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date,
           DATE_FORMAT(t.end_date, '%Y-%m-%d') AS end_date,
           t.sport_id, s.name AS sport_name, s.slug AS sport_slug,
           t.category_id, c.name AS category_name,
           (SELECT COUNT(*) FROM tournament_teams tt
             WHERE tt.tournament_id = t.id AND tt.status = 'confirmed') AS teams_count
    FROM tournaments t
    INNER JOIN sports s ON t.sport_id = s.id
    LEFT JOIN categories c ON t.category_id = c.id`;

export async function findAllByOrganization(organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `${TOURNAMENT_SELECT} WHERE t.organization_id = ? ORDER BY t.created_at DESC, t.id DESC`,
        [organizationId]
    );
    return rows.map(r => ({ ...r, teams_count: Number(r.teams_count) }));
}

/** Datos mínimos para validar cambios (pertenece a la organización). */
export async function findBasic(id: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, sport_id, category_id, name, status, max_teams,
                DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
         FROM tournaments WHERE id = ? AND organization_id = ?`,
        [id, organizationId]
    );
    return rows[0] ?? null;
}

/** Mismo nombre, deporte y categoría dentro de la liga (el nombre no distingue mayúsculas). */
export async function existsDuplicate(
    organizationId: number, sportId: number, categoryId: number | null, name: string, excludeId?: number
) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id FROM tournaments
         WHERE organization_id = ? AND sport_id = ? AND category_id <=> ? AND name = ? AND id <> ?`,
        [organizationId, sportId, categoryId, name, excludeId ?? 0]
    );
    return rows.length > 0;
}

export async function countConfirmedTeams(id: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM tournament_teams WHERE tournament_id = ? AND status = 'confirmed'",
        [id]
    );
    return Number(rows[0].total);
}

export async function countMatches(id: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM matches WHERE tournament_id = ?',
        [id]
    );
    return Number(rows[0].total);
}

export async function update(id: number, organizationId: number, updateFields: any) {
    const data = { ...updateFields };
    // Si viene rules_config como objeto, lo pasamos a string JSON
    if (data.rules_config && typeof data.rules_config === 'object') {
        data.rules_config = JSON.stringify(data.rules_config);
    }

    const { keys, setClause, values } = buildSet(data, TOURNAMENT_UPDATABLE);
    if (keys.length === 0) return false;

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