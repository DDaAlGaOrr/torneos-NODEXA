import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function create(name: string, location: string, mapsUrl: string, organizationId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO fields (name, location, maps_url, organization_id) VALUES (?, ?, ?, ?)',
        [name, location, mapsUrl, organizationId]
    );
    return { id: result.insertId, name, location, maps_url: mapsUrl, organization_id: organizationId };
}

export async function findAllByOrganization(organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, name, location, maps_url FROM fields WHERE organization_id = ? ORDER BY name ASC',
        [organizationId]
    );
    return rows;
}

export async function update(id: number, name: string, location: string, mapsUrl: string, organizationId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'UPDATE fields SET name = ?, location = ?, maps_url = ? WHERE id = ? AND organization_id = ?',
        [name, location, mapsUrl, id, organizationId]
    );
    return result.affectedRows > 0;
}

export async function remove(id: number, organizationId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM fields WHERE id = ? AND organization_id = ?',
        [id, organizationId]
    );
    return result.affectedRows > 0;
}