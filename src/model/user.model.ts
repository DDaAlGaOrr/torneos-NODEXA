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

/**
 * Cambia el rol del usuario. Al dejar de ser entrenador se quita de sus equipos; al dejar de ser
 * árbitro se quita de los partidos que aún no terminan (los finalizados conservan el historial).
 */
export async function changeRole(id: number, fromRole: string, toRole: string, organizationId: number) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [result] = await connection.query<ResultSetHeader>(
            'UPDATE users SET role = ? WHERE id = ? AND organization_id = ? AND role = ?',
            [toRole, id, organizationId, fromRole]
        );
        if (result.affectedRows === 0) {
            await connection.rollback();
            return false;
        }
        if (fromRole === 'coach') {
            await connection.query('DELETE FROM team_coaches WHERE user_id = ?', [id]);
        }
        if (fromRole === 'referee') {
            await connection.query(
                `DELETE mr FROM match_referees mr INNER JOIN matches m ON m.id = mr.match_id
                 WHERE mr.user_id = ? AND m.status <> 'finished'`,
                [id]
            );
        }
        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function setPassword(id: number, role: string, organizationId: number, passwordHash: string) {
    const [result] = await pool.query<ResultSetHeader>(
        'UPDATE users SET password_hash = ? WHERE id = ? AND organization_id = ? AND role = ?',
        [passwordHash, id, organizationId, role]
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