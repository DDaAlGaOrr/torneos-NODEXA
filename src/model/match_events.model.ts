import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import { Actor, logAudit } from '../utils/audit';
import { getRules, rebuildTournament } from './recalc.model';

export async function verifyMatchAccess(matchId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT m.id, m.tournament_id, m.home_team_id, m.away_team_id, m.status
         FROM matches m
         INNER JOIN tournaments t ON m.tournament_id = t.id
         WHERE m.id = ? AND t.organization_id = ?`,
        [matchId, organizationId]
    );
    return rows.length > 0 ? rows[0] : null;
}

export async function playerBelongsToTeam(playerId: number, teamId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM players WHERE id = ? AND team_id = ?',
        [playerId, teamId]
    );
    return rows.length > 0;
}

/** Columna del marcador que suma un evento. own_goal suma al rival de quien lo comete. */
function scoreColumnFor(eventType: string, teamId: number, matchInfo: any): string | null {
    if (eventType !== 'goal' && eventType !== 'own_goal') return null;
    const isHome = Number(matchInfo.home_team_id) === Number(teamId);
    const scoresForHome = eventType === 'goal' ? isHome : !isHome;
    return scoresForHome ? 'score_home' : 'score_away';
}

/** Transacción que termina recalculando el torneo del partido. */
async function inTransaction<T>(tournamentId: number, work: (conn: PoolConnection) => Promise<T>) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await rebuildTournament(connection, tournamentId);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function addEvent(
    matchId: number, teamId: number, playerId: number | null,
    assistPlayerId: number | null, eventType: string, minute: number | null,
    matchInfo: any, actor: Actor
) {
    const tournamentId = Number(matchInfo.tournament_id);
    const rules = await getRules(tournamentId);

    return inTransaction(tournamentId, async (connection) => {
        // Amarilla = descanso temporal (minutos configurables por torneo)
        const payload = eventType === 'yellow_card' && rules.yellow_sin_bin_minutes > 0
            ? { sin_bin_minutes: rules.yellow_sin_bin_minutes }
            : null;

        const [result] = await connection.query<ResultSetHeader>(
            `INSERT INTO match_events
             (match_id, team_id, player_id, assist_player_id, event_type, minute, payload)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [matchId, teamId, playerId, assistPlayerId, eventType, minute, payload ? JSON.stringify(payload) : null]
        );

        const scoreColumn = scoreColumnFor(eventType, teamId, matchInfo);
        if (scoreColumn) {
            await connection.query(
                `UPDATE matches SET ${scoreColumn} = ${scoreColumn} + 1 WHERE id = ?`,
                [matchId]
            );
        }
        // La primera incidencia pone el partido "en juego"
        if (matchInfo.status === 'scheduled') {
            await connection.query(
                "UPDATE matches SET status = 'in_progress', started_at = COALESCE(started_at, NOW()) WHERE id = ?",
                [matchId]
            );
        }

        const event = {
            id: result.insertId, match_id: matchId, event_type: eventType, team_id: teamId,
            player_id: playerId, assist_player_id: assistPlayerId, minute, payload,
        };
        await logAudit(actor, { action: 'match_event.create', entityType: 'match_event', entityId: result.insertId, newValues: event }, connection);
        return event;
    });
}

/** Elimina un evento y revierte el marcador si era gol o autogol. */
export async function deleteEvent(eventId: number, matchId: number, matchInfo: any, actor: Actor) {
    return inTransaction(Number(matchInfo.tournament_id), async (connection) => {
        const [rows] = await connection.query<RowDataPacket[]>(
            'SELECT * FROM match_events WHERE id = ? AND match_id = ? FOR UPDATE',
            [eventId, matchId]
        );
        if (rows.length === 0) return false;
        const ev = rows[0];

        await connection.query('DELETE FROM match_events WHERE id = ?', [eventId]);

        const scoreColumn = scoreColumnFor(ev.event_type, ev.team_id, matchInfo);
        if (scoreColumn) {
            await connection.query(
                `UPDATE matches SET ${scoreColumn} = GREATEST(CAST(${scoreColumn} AS SIGNED) - 1, 0) WHERE id = ?`,
                [matchId]
            );
        }
        await logAudit(actor, { action: 'match_event.delete', entityType: 'match_event', entityId: eventId, oldValues: ev }, connection);
        return true;
    });
}

export async function getEventsByMatch(matchId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT e.id, e.event_type, e.minute, e.payload, e.created_at,
                e.team_id, t.name as team_name,
                e.player_id, p.name as player_name, p.jersey_number,
                e.assist_player_id, a.name as assist_player_name
         FROM match_events e
         INNER JOIN teams t ON e.team_id = t.id
         LEFT JOIN players p ON e.player_id = p.id
         LEFT JOIN players a ON e.assist_player_id = a.id
         WHERE e.match_id = ?
         ORDER BY e.minute ASC, e.id ASC`,
        [matchId]
    );
    return rows.map(r => ({ ...r, payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload }));
}
