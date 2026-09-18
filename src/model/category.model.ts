import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function findAllByOrganization(organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, name FROM categories WHERE organization_id = ? ORDER BY name ASC',
        [organizationId]
    );
    return rows;
}

export async function create(name: string, organizationId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO categories (name, organization_id) VALUES (?, ?)',
        [name, organizationId]
    );
    return { id: result.insertId, name, organization_id: organizationId };
}

export async function update(id: number, name: string, organizationId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'UPDATE categories SET name = ? WHERE id = ? AND organization_id = ?',
        [name, id, organizationId]
    );
    return result.affectedRows > 0;
}

export async function remove(id: number, organizationId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM categories WHERE id = ? AND organization_id = ?',
        [id, organizationId]
    );
    return result.affectedRows > 0;
}