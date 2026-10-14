import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function verifyTournamentOwnership(tournamentId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM tournaments WHERE id = ? AND organization_id = ?',
        [tournamentId, organizationId]
    );
    return rows.length > 0;
}

export async function verifyTeamOwnership(teamId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM teams WHERE id = ? AND organization_id = ?',
        [teamId, organizationId]
    );
    return rows.length > 0;
}

export async function countConfirmed(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) as total FROM tournament_teams WHERE tournament_id = ? AND status = 'confirmed'",
        [tournamentId]
    );
    return Number(rows[0].total);
}

export async function getMaxTeams(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT max_teams FROM tournaments WHERE id = ?',
        [tournamentId]
    );
    return rows.length > 0 ? Number(rows[0].max_teams) : null;
}

/** Inscribe al equipo; si estaba dado de baja (withdrawn) lo reactiva. Si ya está activo lanza ER_DUP_ENTRY. */
export async function enroll(tournamentId: number, teamId: number) {
    const [existing] = await pool.query<RowDataPacket[]>(
        'SELECT id, status FROM tournament_teams WHERE tournament_id = ? AND team_id = ?',
        [tournamentId, teamId]
    );

    if (existing.length > 0) {
        if (existing[0].status !== 'withdrawn') {
            const err: any = new Error('Equipo ya inscrito');
            err.code = 'ER_DUP_ENTRY';
            throw err;
        }
        await pool.query("UPDATE tournament_teams SET status = 'confirmed' WHERE id = ?", [existing[0].id]);
        return { id: existing[0].id, tournament_id: tournamentId, team_id: teamId };
    }

    const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO tournament_teams (tournament_id, team_id, status, payment_status) VALUES (?, ?, "confirmed", "pending")',
        [tournamentId, teamId]
    );
    return { id: result.insertId, tournament_id: tournamentId, team_id: teamId };
}

export async function findTeamsByTournament(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT tt.id as enrollment_id, tt.payment_status, tt.status as enrollment_status, 
                t.id as team_id, t.name, t.short_name, t.logo_url 
         FROM tournament_teams tt
         INNER JOIN teams t ON tt.team_id = t.id
         WHERE tt.tournament_id = ?
         ORDER BY t.name ASC`,
        [tournamentId]
    );
    return rows;
}

/** Baja lógica: conserva el historial (partidos, estadísticas) y la tabla deja de contar al equipo. */
export async function removeEnrollment(tournamentId: number, teamId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        "UPDATE tournament_teams SET status = 'withdrawn' WHERE tournament_id = ? AND team_id = ? AND status <> 'withdrawn'",
        [tournamentId, teamId]
    );
    return result.affectedRows > 0;
}
