import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function create(
    organizationId: number, categoryId: number, name: string,
    shortName: string, primaryColor: string, contactEmail: string,
    contactPhone: string, coachIds: number[]
) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [teamResult] = await connection.query<ResultSetHeader>(
            `INSERT INTO teams 
            (organization_id, category_id, name, short_name, primary_color, contact_email, contact_phone) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [organizationId, categoryId, name, shortName, primaryColor, contactEmail, contactPhone]
        );
        const teamId = teamResult.insertId;

        if (coachIds && coachIds.length > 0) {
            for (const coachId of coachIds) {
                await connection.query(
                    'INSERT INTO team_coaches (team_id, user_id) VALUES (?, ?)',
                    [teamId, coachId]
                );
            }
        }

        await connection.commit();
        return { id: teamId, name, category_id: categoryId };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function findAllByOrganization(organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT t.id, t.name, t.short_name, t.primary_color, c.name as category_name
         FROM teams t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.organization_id = ? 
         ORDER BY t.name ASC`,
        [organizationId]
    );
    return rows;
}

export async function update(
    id: number, organizationId: number, categoryId: number, name: string,
    shortName: string, primaryColor: string, contactEmail: string,
    contactPhone: string, coachIds: number[]
) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [updateResult] = await connection.query<ResultSetHeader>(
            `UPDATE teams 
             SET category_id = ?, name = ?, short_name = ?, primary_color = ?, contact_email = ?, contact_phone = ? 
             WHERE id = ? AND organization_id = ?`,
            [categoryId, name, shortName, primaryColor, contactEmail, contactPhone, id, organizationId]
        );

        if (updateResult.affectedRows === 0) {
            await connection.rollback();
            return false;
        }

        await connection.query('DELETE FROM team_coaches WHERE team_id = ?', [id]);

        if (coachIds && coachIds.length > 0) {
            for (const coachId of coachIds) {
                await connection.query(
                    'INSERT INTO team_coaches (team_id, user_id) VALUES (?, ?)',
                    [id, coachId]
                );
            }
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

export async function remove(id: number, organizationId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM teams WHERE id = ? AND organization_id = ?',
        [id, organizationId]
    );
    return result.affectedRows > 0;
}