import pool from '../conection/index';
import { RowDataPacket } from 'mysql2';

/** Los deportes son un catálogo global (no pertenecen a una organización). */
export async function findAll() {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id, name, slug FROM sports ORDER BY id ASC');
    return rows;
}

export async function exists(id: number) {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM sports WHERE id = ?', [id]);
    return rows.length > 0;
}
