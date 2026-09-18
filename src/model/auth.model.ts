import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function findByEmail(email: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, organization_id, name, email, password_hash, role, active FROM users WHERE email = ?',
        [email]
    );
    return rows[0] || null;
}   