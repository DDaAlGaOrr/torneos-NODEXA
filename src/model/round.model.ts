import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { buildSet } from '../utils/fields';

export const ROUND_UPDATABLE = ['group_id', 'name', 'round_order', 'type', 'status'] as const;

export async function verifyTournamentOwnership(tournamentId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM tournaments WHERE id = ? AND organization_id = ?',
        [tournamentId, organizationId]
    );
    return rows.length > 0;
}

export async function create(
    tournamentId: number, groupId: number | null, name: string,
    roundOrder: number, type: string
) {
    const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO rounds (tournament_id, group_id, name, round_order, type, status) 
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [tournamentId, groupId, name, roundOrder, type]
    );
    return {
        id: result.insertId,
        tournament_id: tournamentId,
        group_id: groupId,
        name,
        round_order: roundOrder,
        type,
        status: 'pending'
    };
}

export async function findAllByTournament(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, group_id, name, round_order, type, status 
         FROM rounds 
         WHERE tournament_id = ? 
         ORDER BY round_order ASC`,
        [tournamentId]
    );
    return rows;
}

export async function update(id: number, tournamentId: number, updateFields: any) {
    const { keys, setClause, values } = buildSet(updateFields, ROUND_UPDATABLE);
    if (keys.length === 0) return false;

    const [result] = await pool.query<ResultSetHeader>(
        `UPDATE rounds SET ${setClause} WHERE id = ? AND tournament_id = ?`,
        [...values, id, tournamentId]
    );
    return result.affectedRows > 0;
}

export async function remove(id: number, tournamentId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM rounds WHERE id = ? AND tournament_id = ?',
        [id, tournamentId]
    );
    return result.affectedRows > 0;
}

export async function groupBelongsToTournament(groupId: number, tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM `groups` WHERE id = ? AND tournament_id = ?',
        [groupId, tournamentId]
    );
    return rows.length > 0;
}
