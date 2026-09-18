import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function create(name: string, email: string, passwordHash: string, role: string, organizationId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO users (name, email, password_hash, role, organization_id) VALUES (?, ?, ?, ?, ?)',
        [name, email, passwordHash, role, organizationId]
    );
    return { id: result.insertId, name, email, role, organization_id: organizationId };
}

export async function findAllByRole(role: string, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, name, email, active, role FROM users WHERE organization_id = ? AND role = ? ORDER BY name ASC',
        [organizationId, role]
    );
    return rows;
}

export async function update(id: number, name: string, email: string, active: number, role: string, organizationId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'UPDATE users SET name = ?, email = ?, active = ? WHERE id = ? AND organization_id = ? AND role = ?',
        [name, email, active, id, organizationId, role]
    );
    return result.affectedRows > 0;
}

export async function remove(id: number, role: string, organizationId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM users WHERE id = ? AND organization_id = ? AND role = ?',
        [id, organizationId, role]
    );
    return result.affectedRows > 0;
}