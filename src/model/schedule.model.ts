import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { Actor, logAudit } from '../utils/audit';
import { rebuildTournament } from './recalc.model';

export async function findTournament(tournamentId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, name, format, status FROM tournaments WHERE id = ? AND organization_id = ?',
        [tournamentId, organizationId]
    );
    return rows[0] ?? null;
}

/** Jornadas existentes del torneo por tipo, con cuántos partidos ya empezaron. */
export async function findRounds(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT r.id, r.type,
                SUM(m.status IN ('in_progress', 'finished')) AS started,
                (SELECT COUNT(*) FROM match_events e INNER JOIN matches me ON me.id = e.match_id WHERE me.round_id = r.id) AS events
         FROM rounds r LEFT JOIN matches m ON m.round_id = r.id
         WHERE r.tournament_id = ?
         GROUP BY r.id, r.type`,
        [tournamentId]
    );
    return rows.map(r => ({ id: Number(r.id), type: r.type as string, started: Number(r.started || 0) + Number(r.events || 0) }));
}

export async function findTeamNames(teamIds: number[]) {
    if (teamIds.length === 0) return new Map<number, string>();
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id, name FROM teams WHERE id IN (?)', [teamIds]);
    return new Map(rows.map(r => [Number(r.id), String(r.name)]));
}

export async function findOrgFields(fieldIds: number[], organizationId: number) {
    if (fieldIds.length === 0) return [];
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, name FROM fields WHERE id IN (?) AND organization_id = ?', [fieldIds, organizationId]
    );
    return rows.map(r => ({ id: Number(r.id), name: String(r.name) }));
}

/**
 * Partidos de la organización (de cualquier torneo) que ya ocupan cancha entre dos fechas.
 * Se excluyen los de las jornadas que se van a reemplazar.
 */
export async function findBusyMatches(organizationId: number, from: string, to: string, excludeRoundIds: number[]) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT m.field_id, DATE_FORMAT(m.scheduled_at, '%Y-%m-%d %H:%i:00') AS scheduled_at
         FROM matches m INNER JOIN tournaments t ON t.id = m.tournament_id
         WHERE t.organization_id = ? AND m.field_id IS NOT NULL AND m.scheduled_at IS NOT NULL
           AND m.status IN ('scheduled', 'in_progress')
           AND m.scheduled_at >= ? AND m.scheduled_at < DATE_ADD(?, INTERVAL 1 DAY)
           AND m.round_id NOT IN (?)`,
        [organizationId, from, to, excludeRoundIds.length ? excludeRoundIds : [0]]
    );
    return rows.map(r => ({ field_id: Number(r.field_id), scheduled_at: String(r.scheduled_at) }));
}

export interface PlannedRound {
    name: string;
    matches: { home: number; away: number; field_id: number | null; scheduled_at: string | null }[];
}

/** Guarda el calendario (todo o nada); si se indica, borra antes las jornadas de grupos sin jugar. */
export async function persistSchedule(tournamentId: number, rounds: PlannedRound[], replaceRoundIds: number[], actor: Actor, summary: any) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        if (replaceRoundIds.length > 0) {
            await connection.query('DELETE FROM matches WHERE tournament_id = ? AND round_id IN (?)', [tournamentId, replaceRoundIds]);
            await connection.query('DELETE FROM rounds WHERE tournament_id = ? AND id IN (?)', [tournamentId, replaceRoundIds]);
        }

        let created = 0;
        for (const [i, round] of rounds.entries()) {
            const [r] = await connection.query<ResultSetHeader>(
                "INSERT INTO rounds (tournament_id, group_id, name, round_order, type, status) VALUES (?, NULL, ?, ?, 'group', 'pending')",
                [tournamentId, round.name, i + 1]
            );
            if (round.matches.length > 0) {
                await connection.query(
                    `INSERT INTO matches (tournament_id, round_id, home_team_id, away_team_id, field_id, scheduled_at, status) VALUES ?`,
                    [round.matches.map(m => [tournamentId, r.insertId, m.home, m.away, m.field_id, m.scheduled_at, 'scheduled'])]
                );
                created += round.matches.length;
            }
        }

        await rebuildTournament(connection, tournamentId);
        await logAudit(actor, {
            action: 'schedule.generate', entityType: 'tournament', entityId: tournamentId,
            oldValues: replaceRoundIds.length ? { replaced_round_ids: replaceRoundIds } : undefined,
            newValues: summary,
        }, connection);
        await connection.commit();
        return { rounds: rounds.length, matches: created };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
