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
        `SELECT t.id, t.name, t.short_name, t.logo_url, t.primary_color,
                t.category_id, c.name as category_name,
                t.contact_email, t.contact_phone,
                t.captain_player_id, cp.name as captain_name,
                (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) as players_count
         FROM teams t
         LEFT JOIN categories c ON t.category_id = c.id
         LEFT JOIN players cp ON t.captain_player_id = cp.id
         WHERE t.organization_id = ? 
         ORDER BY t.name ASC`,
        [organizationId]
    );
    const [coaches] = await pool.query<RowDataPacket[]>(
        `SELECT tc.team_id, u.id, u.name
         FROM team_coaches tc
         INNER JOIN users u ON tc.user_id = u.id
         INNER JOIN teams t ON tc.team_id = t.id
         WHERE t.organization_id = ?
         ORDER BY u.name ASC`,
        [organizationId]
    );
    return rows.map(r => ({
        ...r,
        players_count: Number(r.players_count),
        coaches: coaches.filter(c => c.team_id === r.id).map(c => ({ id: c.id as number, name: c.name as string })),
    }));
}

/** La categoría debe pertenecer a la organización. */
export async function categoryBelongsToOrg(categoryId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM categories WHERE id = ? AND organization_id = ?',
        [categoryId, organizationId]
    );
    return rows.length > 0;
}

/** Cuántos de los IDs son entrenadores de la organización. */
export async function countCoachesOfOrg(coachIds: number[], organizationId: number) {
    if (coachIds.length === 0) return 0;
    const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) as total FROM users WHERE id IN (?) AND organization_id = ? AND role = 'coach'",
        [coachIds, organizationId]
    );
    return Number(rows[0].total);
}

/**
 * Borrar un equipo elimina en cascada sus partidos, eventos y posiciones.
 * Se considera "con historial" si tiene partidos o una inscripción vigente.
 */
export async function historyOf(teamId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT
            (SELECT COUNT(*) FROM matches m WHERE m.home_team_id = t.id OR m.away_team_id = t.id) as matches,
            (SELECT COUNT(*) FROM tournament_teams tt WHERE tt.team_id = t.id AND tt.status <> 'withdrawn') as enrollments
         FROM teams t
         WHERE t.id = ? AND t.organization_id = ?`,
        [teamId, organizationId]
    );
    if (rows.length === 0) return { matches: 0, enrollments: 0 };
    return { matches: Number(rows[0].matches), enrollments: Number(rows[0].enrollments) };
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
/** Asigna (o quita con null) al capitán. El jugador debe pertenecer al equipo y el equipo a la organización. */
export async function setCaptain(teamId: number, organizationId: number, playerId: number | null) {
    if (playerId !== null) {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT p.id FROM players p
             INNER JOIN teams t ON p.team_id = t.id
             WHERE p.id = ? AND t.id = ? AND t.organization_id = ?`,
            [playerId, teamId, organizationId]
        );
        if (rows.length === 0) return false;
    }
    const [result] = await pool.query<ResultSetHeader>(
        'UPDATE teams SET captain_player_id = ? WHERE id = ? AND organization_id = ?',
        [playerId, teamId, organizationId]
    );
    return result.affectedRows > 0;
}
