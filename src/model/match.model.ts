import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { AppError } from '../middlewares/error.handler';
import { PoolConnection } from 'mysql2/promise';
import { buildSet } from '../utils/fields';
import { Actor, logAudit } from '../utils/audit';
import { rebuildTournament } from './recalc.model';

export const MATCH_UPDATABLE = [
    'round_id', 'home_team_id', 'away_team_id', 'field_id', 'scheduled_at', 'status',
    'score_home', 'score_away', 'penalties_home', 'penalties_away',
    'next_match_id', 'next_match_position'
] as const;

const MATCH_STATUSES = ['scheduled', 'in_progress', 'finished', 'cancelled', 'postponed'];
export async function verifyTournamentOwnership(tournamentId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM tournaments WHERE id = ? AND organization_id = ?',
        [tournamentId, organizationId]
    );
    return rows.length > 0;
}

/**
 * Verifica que round, equipos, cancha y siguiente partido pertenezcan al torneo
 * (y a la organización). Devuelve un mensaje de error o null si todo es válido.
 * Solo valida los campos que vienen definidos.
 */
export async function validateMatchRefs(
    tournamentId: number, organizationId: number,
    refs: { round_id?: any; home_team_id?: any; away_team_id?: any; field_id?: any; next_match_id?: any; status?: any }
): Promise<string | null> {
    const has = (v: any) => v !== undefined && v !== null;

    if (has(refs.status) && !MATCH_STATUSES.includes(refs.status)) {
        return 'Estatus de partido inválido';
    }
    if (has(refs.home_team_id) && has(refs.away_team_id) && Number(refs.home_team_id) === Number(refs.away_team_id)) {
        return 'El equipo local y el visitante no pueden ser el mismo';
    }
    if (has(refs.round_id)) {
        const [r] = await pool.query<RowDataPacket[]>(
            'SELECT id FROM rounds WHERE id = ? AND tournament_id = ?', [refs.round_id, tournamentId]
        );
        if (r.length === 0) return 'La jornada no pertenece a este torneo';
    }
    for (const teamId of [refs.home_team_id, refs.away_team_id]) {
        if (has(teamId)) {
            const [r] = await pool.query<RowDataPacket[]>(
                "SELECT id FROM tournament_teams WHERE tournament_id = ? AND team_id = ? AND status = 'confirmed'", [tournamentId, teamId]
            );
            if (r.length === 0) return 'Uno de los equipos no está inscrito (confirmado) en este torneo';
        }
    }
    if (has(refs.round_id) && has(refs.home_team_id) && has(refs.away_team_id)) {
        const [rt] = await pool.query<RowDataPacket[]>('SELECT type FROM rounds WHERE id = ?', [refs.round_id]);
        if (rt.length > 0 && rt[0].type === 'group') {
            const [g] = await pool.query<RowDataPacket[]>(
                'SELECT team_id, group_id FROM group_teams WHERE tournament_id = ? AND team_id IN (?, ?)',
                [tournamentId, refs.home_team_id, refs.away_team_id]
            );
            const groupOf = (id: any) => g.find(x => Number(x.team_id) === Number(id))?.group_id;
            const gh = groupOf(refs.home_team_id), ga = groupOf(refs.away_team_id);
            if (gh !== undefined && ga !== undefined && gh !== ga) {
                return 'En fase de grupos los dos equipos deben pertenecer al mismo grupo';
            }
        }
    }
    if (has(refs.field_id)) {
        const [r] = await pool.query<RowDataPacket[]>(
            'SELECT id FROM fields WHERE id = ? AND organization_id = ?', [refs.field_id, organizationId]
        );
        if (r.length === 0) return 'La cancha no pertenece a tu organización';
    }
    if (has(refs.next_match_id)) {
        const [r] = await pool.query<RowDataPacket[]>(
            'SELECT id FROM matches WHERE id = ? AND tournament_id = ?', [refs.next_match_id, tournamentId]
        );
        if (r.length === 0) return 'El siguiente partido no pertenece a este torneo';
    }
    return null;
}

export async function create(
    tournamentId: number, roundId: number, homeTeamId: number,
    awayTeamId: number, fieldId: number | null, scheduledAt: string | null
) {
    const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO matches 
         (tournament_id, round_id, home_team_id, away_team_id, field_id, scheduled_at, status) 
         VALUES (?, ?, ?, ?, ?, ?, 'scheduled')`,
        [tournamentId, roundId, homeTeamId, awayTeamId, fieldId, scheduledAt]
    );
    return {
        id: result.insertId, tournament_id: tournamentId, round_id: roundId,
        home_team_id: homeTeamId, away_team_id: awayTeamId, status: 'scheduled'
    };
}

export async function findAllByTournament(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT m.id, m.status, m.scheduled_at, DATE_FORMAT(m.scheduled_at, '%Y-%m-%d %H:%i') AS scheduled_local,
                m.started_at, m.finished_at, m.score_home, m.score_away,
                m.penalties_home, m.penalties_away, m.winner_team_id,
                m.round_id, r.name as round_name, r.round_order, r.type as round_type, r.group_id,
                m.home_team_id, th.name as home_team, th.logo_url as home_logo, th.primary_color as home_color,
                m.away_team_id, ta.name as away_team, ta.logo_url as away_logo, ta.primary_color as away_color,
                m.field_id, f.name as field_name, f.maps_url,
                m.next_match_id, m.next_match_position
         FROM matches m
         INNER JOIN rounds r ON m.round_id = r.id
         LEFT JOIN teams th ON m.home_team_id = th.id
         LEFT JOIN teams ta ON m.away_team_id = ta.id
         LEFT JOIN fields f ON m.field_id = f.id
         WHERE m.tournament_id = ?
         ORDER BY r.round_order ASC, m.scheduled_at ASC`,
        [tournamentId]
    );
    return rows;
}

/** Campos que se pueden cambiar en un partido ya finalizado (no alteran el resultado). */
export const FINISHED_MATCH_EDITABLE = ['field_id', 'scheduled_at'];

export async function findById(id: number, tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT m.*, r.type AS round_type,
                DATE_FORMAT(m.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at_local,
                (SELECT COUNT(*) FROM match_events e WHERE e.match_id = m.id) AS events_count
         FROM matches m INNER JOIN rounds r ON r.id = m.round_id
         WHERE m.id = ? AND m.tournament_id = ?`,
        [id, tournamentId]
    );
    if (rows.length === 0) return null;
    return { ...rows[0], events_count: Number(rows[0].events_count) } as any;
}

/**
 * Partidos de la liga que chocan con el horario propuesto: misma cancha o algún equipo
 * jugando a menos de `durationMinutes` de distancia. Ignora cancelados, suspendidos y finalizados.
 */
export async function findScheduleConflicts(
    organizationId: number, matchId: number, scheduledAt: string,
    fieldId: number | null, teamIds: number[], durationMinutes: number
) {
    const teams = teamIds.length ? teamIds : [0];
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT m.id, m.tournament_id, t.name AS tournament_name, m.scheduled_at,
                th.name AS home_team, ta.name AS away_team, f.name AS field_name,
                (m.field_id <=> ?) AS same_field,
                (m.home_team_id IN (?) OR m.away_team_id IN (?)) AS same_team
         FROM matches m
         INNER JOIN tournaments t ON t.id = m.tournament_id AND t.organization_id = ?
         LEFT JOIN teams th ON th.id = m.home_team_id
         LEFT JOIN teams ta ON ta.id = m.away_team_id
         LEFT JOIN fields f ON f.id = m.field_id
         WHERE m.id <> ? AND m.scheduled_at IS NOT NULL AND m.status IN ('scheduled', 'in_progress')
           AND ABS(TIMESTAMPDIFF(MINUTE, m.scheduled_at, ?)) < ?
           AND ((? IS NOT NULL AND m.field_id = ?) OR m.home_team_id IN (?) OR m.away_team_id IN (?))
         ORDER BY m.scheduled_at`,
        [fieldId, teams, teams, organizationId, matchId, scheduledAt, durationMinutes, fieldId, fieldId, teams, teams]
    );
    return rows.map(r => ({
        match_id: Number(r.id), tournament_id: Number(r.tournament_id), tournament_name: r.tournament_name,
        scheduled_at: r.scheduled_at, home_team: r.home_team, away_team: r.away_team, field_name: r.field_name,
        reason: Number(r.same_field) ? 'field' : 'team',
    }));
}

/** Partidos asignados a un árbitro (no cancelados), los próximos primero. */
export async function findAssignedToReferee(userId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT m.id, m.tournament_id, t.name AS tournament_name, m.status, m.scheduled_at,
                m.score_home, m.score_away, mr.role AS referee_role,
                r.name AS round_name, r.type AS round_type,
                th.name AS home_team, th.primary_color AS home_color,
                ta.name AS away_team, ta.primary_color AS away_color,
                f.name AS field_name
         FROM match_referees mr
         INNER JOIN matches m ON m.id = mr.match_id
         INNER JOIN tournaments t ON t.id = m.tournament_id AND t.organization_id = ?
         INNER JOIN rounds r ON r.id = m.round_id
         LEFT JOIN teams th ON th.id = m.home_team_id
         LEFT JOIN teams ta ON ta.id = m.away_team_id
         LEFT JOIN fields f ON f.id = m.field_id
         WHERE mr.user_id = ? AND m.status <> 'cancelled'
         ORDER BY FIELD(m.status, 'in_progress', 'scheduled', 'postponed', 'finished'), m.scheduled_at IS NULL, m.scheduled_at ASC`,
        [organizationId, userId]
    );
    return rows;
}

export async function findDetail(id: number, tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT m.id, m.tournament_id, m.status, m.scheduled_at, m.started_at, m.finished_at,
                m.score_home, m.score_away, m.penalties_home, m.penalties_away, m.winner_team_id,
                m.next_match_id, m.next_match_position, m.prev_match_home_id, m.prev_match_away_id,
                m.round_id, r.name AS round_name, r.type AS round_type, g.name AS group_name,
                t.name AS tournament_name, s.slug AS sport_slug,
                m.home_team_id, th.name AS home_team, th.short_name AS home_short, th.logo_url AS home_logo, th.primary_color AS home_color,
                m.away_team_id, ta.name AS away_team, ta.short_name AS away_short, ta.logo_url AS away_logo, ta.primary_color AS away_color,
                m.field_id, f.name AS field_name, f.location AS field_location, f.maps_url
         FROM matches m
         INNER JOIN rounds r ON r.id = m.round_id
         INNER JOIN tournaments t ON t.id = m.tournament_id
         INNER JOIN sports s ON s.id = t.sport_id
         LEFT JOIN \`groups\` g ON g.id = r.group_id
         LEFT JOIN teams th ON th.id = m.home_team_id
         LEFT JOIN teams ta ON ta.id = m.away_team_id
         LEFT JOIN fields f ON f.id = m.field_id
         WHERE m.id = ? AND m.tournament_id = ?`,
        [id, tournamentId]
    );
    return rows[0] ?? null;
}

/**
 * Jugadores de los equipos con su acumulado de tarjetas en el torneo y si tienen
 * una suspensión pendiente de un partido anterior.
 */
export async function findRosters(tournamentId: number, teamIds: number[], currentMatchId?: number) {
    if (teamIds.length === 0) return [];
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT p.id, p.team_id, p.name, p.jersey_number, p.position, p.status, p.photo_url,
                COALESCE(st.goals, 0) AS goals, COALESCE(st.yellow_cards, 0) AS yellow_cards,
                COALESCE(st.red_cards, 0) AS red_cards,
                (SELECT COUNT(*) FROM sanctions sa
                  WHERE sa.player_id = p.id AND sa.tournament_id = ? AND sa.status = 'pending'
                    AND (sa.match_id IS NULL OR sa.match_id <> ?)) AS pending_sanctions
         FROM players p
         LEFT JOIN player_tournament_stats st ON st.player_id = p.id AND st.tournament_id = ?
         WHERE p.team_id IN (?)
         ORDER BY p.team_id, CAST(p.jersey_number AS UNSIGNED), p.name`,
        [tournamentId, currentMatchId ?? 0, tournamentId, teamIds]
    );
    return rows.map((r): any => ({
        ...r,
        goals: Number(r.goals), yellow_cards: Number(r.yellow_cards), red_cards: Number(r.red_cards),
        suspended: Number(r.pending_sanctions) > 0,
    }));
}

/** Ejecuta `work` en una transacción y, antes de confirmar, recalcula tabla, estadísticas y sanciones. */
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

export async function update(id: number, tournamentId: number, updateFields: any, actor: Actor) {
    const { keys, setClause, values } = buildSet(updateFields, MATCH_UPDATABLE);
    if (keys.length === 0) return false;

    return inTransaction(tournamentId, async (conn) => {
        const [before] = await conn.query<RowDataPacket[]>(
            `SELECT ${keys.join(', ')} FROM matches WHERE id = ? AND tournament_id = ? FOR UPDATE`, [id, tournamentId]
        );
        if (before.length === 0) return false;

        const extra = updateFields.status === 'in_progress' ? ', started_at = COALESCE(started_at, NOW())' : '';
        await conn.query(
            `UPDATE matches SET ${setClause}${extra} WHERE id = ? AND tournament_id = ?`,
            [...values, id, tournamentId]
        );
        await logAudit(actor, {
            action: 'match.update', entityType: 'match', entityId: id,
            oldValues: before[0], newValues: Object.fromEntries(keys.map(k => [k, updateFields[k]])),
        }, conn);
        return true;
    });
}

export async function remove(id: number, tournamentId: number, actor: Actor) {
    return inTransaction(tournamentId, async (conn) => {
        const [before] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM matches WHERE id = ? AND tournament_id = ? FOR UPDATE', [id, tournamentId]
        );
        if (before.length === 0) return false;
        // Los partidos de la llave que venían de este quedan sin origen
        await conn.query('UPDATE matches SET prev_match_home_id = NULL WHERE prev_match_home_id = ?', [id]);
        await conn.query('UPDATE matches SET prev_match_away_id = NULL WHERE prev_match_away_id = ?', [id]);
        await conn.query('DELETE FROM matches WHERE id = ? AND tournament_id = ?', [id, tournamentId]);
        await logAudit(actor, { action: 'match.delete', entityType: 'match', entityId: id, oldValues: before[0] }, conn);
        return true;
    });
}

export interface FinishOptions {
    penalties_home?: number | null;
    penalties_away?: number | null;
}

/**
 * Finaliza el partido, define al ganador, lo pasa al siguiente partido de la llave
 * y recalcula tabla, estadísticas y sanciones. Todo en una sola transacción.
 */
export async function finishAndAdvance(matchId: number, tournamentId: number, actor: Actor, options: FinishOptions = {}) {
    return inTransaction(tournamentId, async (connection) => {
        // FOR UPDATE: bloquea la fila para evitar doble finalización concurrente
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT m.home_team_id, m.away_team_id, m.score_home, m.score_away, m.penalties_home, m.penalties_away,
                    m.next_match_id, m.next_match_position, m.status, r.type AS round_type
             FROM matches m INNER JOIN rounds r ON r.id = m.round_id
             WHERE m.id = ? AND m.tournament_id = ? FOR UPDATE`,
            [matchId, tournamentId]
        );

        if (rows.length === 0) throw new AppError(404, 'Partido no encontrado');
        const match = rows[0];

        if (match.status === 'finished') {
            throw new AppError(409, 'El partido ya está finalizado');
        }
        if (match.status === 'cancelled' || match.status === 'postponed') {
            throw new AppError(409, 'El partido está cancelado o suspendido; reprográmalo antes de finalizarlo');
        }
        if (!match.home_team_id || !match.away_team_id) {
            throw new AppError(400, 'El partido aún no tiene los dos equipos definidos');
        }

        // Toda la eliminatoria (incluida la final, que no tiene siguiente partido) necesita un ganador
        const isKnockout = match.round_type === 'bracket';
        const tied = Number(match.score_home) === Number(match.score_away);

        let penHome = match.penalties_home, penAway = match.penalties_away;
        if (options.penalties_home !== undefined) penHome = options.penalties_home;
        if (options.penalties_away !== undefined) penAway = options.penalties_away;
        if (!isKnockout || !tied) { penHome = null; penAway = null; }

        if (isKnockout && tied) {
            if (penHome === null || penAway === null) {
                throw new AppError(400, 'Partido de eliminatoria empatado. Registra el resultado de los penales antes de finalizar.');
            }
            if (Number(penHome) === Number(penAway)) {
                throw new AppError(400, 'El partido no puede finalizar empatado en penales.');
            }
        }

        // Ganador: por marcador; en empate de eliminatoria, por penales; empate en grupos = null
        let winnerTeamId: number | null = null;
        if (!tied) {
            winnerTeamId = Number(match.score_home) > Number(match.score_away) ? match.home_team_id : match.away_team_id;
        } else if (isKnockout) {
            winnerTeamId = Number(penHome) > Number(penAway) ? match.home_team_id : match.away_team_id;
        }

        await connection.query(
            `UPDATE matches
             SET status = 'finished', winner_team_id = ?, penalties_home = ?, penalties_away = ?,
                 started_at = COALESCE(started_at, NOW()), finished_at = NOW()
             WHERE id = ? AND tournament_id = ?`,
            [winnerTeamId, penHome, penAway, matchId, tournamentId]
        );

        if (isKnockout && winnerTeamId && match.next_match_id && match.next_match_position) {
            const targetColumn = match.next_match_position === 'home' ? 'home_team_id' : 'away_team_id';
            // El siguiente partido debe ser del mismo torneo
            const [upd] = await connection.query<ResultSetHeader>(
                `UPDATE matches SET ${targetColumn} = ? WHERE id = ? AND tournament_id = ?`,
                [winnerTeamId, match.next_match_id, tournamentId]
            );
            if (upd.affectedRows === 0) {
                throw new AppError(400, 'El siguiente partido de la llave no existe en este torneo');
            }
        }

        const result = {
            match_id: matchId,
            score_home: Number(match.score_home), score_away: Number(match.score_away),
            penalties_home: penHome, penalties_away: penAway,
            winner_team_id: winnerTeamId,
            advanced_to_match_id: isKnockout && winnerTeamId ? match.next_match_id : null,
        };
        await logAudit(actor, {
            action: 'match.finish', entityType: 'match', entityId: matchId,
            oldValues: { status: match.status }, newValues: result,
        }, connection);
        return result;
    });
}

/**
 * Regresa un partido finalizado a "en juego" para corregir el resultado.
 * En la llave, saca al ganador del siguiente partido (solo si ese partido aún no empieza).
 */
export async function reopen(matchId: number, tournamentId: number, actor: Actor) {
    return inTransaction(tournamentId, async (conn) => {
        const [rows] = await conn.query<RowDataPacket[]>(
            `SELECT status, winner_team_id, next_match_id, next_match_position, score_home, score_away,
                    penalties_home, penalties_away
             FROM matches WHERE id = ? AND tournament_id = ? FOR UPDATE`,
            [matchId, tournamentId]
        );
        if (rows.length === 0) throw new AppError(404, 'Partido no encontrado');
        const match = rows[0];
        if (match.status !== 'finished') throw new AppError(409, 'Solo se puede reabrir un partido finalizado');

        if (match.next_match_id && match.winner_team_id) {
            const [next] = await conn.query<RowDataPacket[]>(
                'SELECT status FROM matches WHERE id = ? AND tournament_id = ? FOR UPDATE',
                [match.next_match_id, tournamentId]
            );
            if (next.length > 0) {
                if (next[0].status === 'in_progress' || next[0].status === 'finished') {
                    throw new AppError(409, 'El siguiente partido de la llave ya empezó; reábrelo y corrígelo primero');
                }
                const column = match.next_match_position === 'home' ? 'home_team_id' : 'away_team_id';
                await conn.query(
                    `UPDATE matches SET ${column} = NULL WHERE id = ? AND ${column} = ?`,
                    [match.next_match_id, match.winner_team_id]
                );
            }
        }

        await conn.query(
            "UPDATE matches SET status = 'in_progress', winner_team_id = NULL, finished_at = NULL WHERE id = ?",
            [matchId]
        );
        await logAudit(actor, {
            action: 'match.reopen', entityType: 'match', entityId: matchId,
            oldValues: match, newValues: { status: 'in_progress' },
        }, conn);
        return true;
    });
}

export async function isRefereeAssigned(matchId: number, userId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT match_id FROM match_referees WHERE match_id = ? AND user_id = ?',
        [matchId, userId]
    );
    return rows.length > 0;
}

export async function matchBelongsToTournament(matchId: number, tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM matches WHERE id = ? AND tournament_id = ?',
        [matchId, tournamentId]
    );
    return rows.length > 0;
}

export async function isActiveReferee(userId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE id = ? AND organization_id = ? AND role = 'referee' AND active = 1",
        [userId, organizationId]
    );
    return rows.length > 0;
}

export async function assignReferee(matchId: number, userId: number, role: string) {
    await pool.query(
        'INSERT INTO match_referees (match_id, user_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
        [matchId, userId, role]
    );
    return { match_id: matchId, user_id: userId, role };
}

export async function findReferees(matchId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT u.id as user_id, u.name, u.email, mr.role
         FROM match_referees mr
         INNER JOIN users u ON mr.user_id = u.id
         WHERE mr.match_id = ?
         ORDER BY mr.role ASC, u.name ASC`,
        [matchId]
    );
    return rows;
}

export async function removeReferee(matchId: number, userId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM match_referees WHERE match_id = ? AND user_id = ?',
        [matchId, userId]
    );
    return result.affectedRows > 0;
}
