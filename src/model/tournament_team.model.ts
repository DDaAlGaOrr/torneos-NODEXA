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

export async function enroll(tournamentId: number, teamId: number) {
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

export async function removeEnrollment(tournamentId: number, teamId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM tournament_teams WHERE tournament_id = ? AND team_id = ?',
        [tournamentId, teamId]
    );
    return result.affectedRows > 0;
}