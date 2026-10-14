import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { AppError } from '../middlewares/error.handler';
import { buildSet } from '../utils/fields';

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
        `SELECT m.id, m.status, m.scheduled_at, m.score_home, m.score_away,
                r.name as round_name, r.round_order,
                th.name as home_team, th.logo_url as home_logo,
                ta.name as away_team, ta.logo_url as away_logo,
                f.name as field_name, f.maps_url
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

export async function update(id: number, tournamentId: number, updateFields: any) {
    const { keys, setClause, values } = buildSet(updateFields, MATCH_UPDATABLE);
    if (keys.length === 0) return false;

    const [result] = await pool.query<ResultSetHeader>(
        `UPDATE matches SET ${setClause} WHERE id = ? AND tournament_id = ?`,
        [...values, id, tournamentId]
    );
    return result.affectedRows > 0;
}

export async function remove(id: number, tournamentId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM matches WHERE id = ? AND tournament_id = ?',
        [id, tournamentId]
    );
    return result.affectedRows > 0;
}

export async function finishAndAdvance(matchId: number, tournamentId: number) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // FOR UPDATE: bloquea la fila para evitar doble finalización concurrente
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT home_team_id, away_team_id, score_home, score_away, penalties_home, penalties_away,
                    next_match_id, next_match_position, status
             FROM matches WHERE id = ? AND tournament_id = ? FOR UPDATE`,
            [matchId, tournamentId]
        );

        if (rows.length === 0) throw new AppError(404, 'Partido no encontrado');
        const match = rows[0];

        if (match.status === 'finished') {
            throw new AppError(409, 'El partido ya está finalizado');
        }
        if (!match.home_team_id || !match.away_team_id) {
            throw new AppError(400, 'El partido aún no tiene los dos equipos definidos');
        }

        const isKnockout = !!(match.next_match_id && match.next_match_position);

        if (isKnockout && match.score_home === match.score_away) {
            if (match.penalties_home === null || match.penalties_away === null) {
                throw new AppError(400, 'Partido de eliminatoria empatado. Registra el resultado de los penales antes de finalizar.');
            }
            if (match.penalties_home === match.penalties_away) {
                throw new AppError(400, 'El partido no puede finalizar empatado en penales.');
            }
        }

        // Ganador: por marcador; en empate de eliminatoria, por penales; empate en grupos = null
        let winnerTeamId: number | null = null;
        if (match.score_home !== match.score_away) {
            winnerTeamId = match.score_home > match.score_away ? match.home_team_id : match.away_team_id;
        } else if (isKnockout) {
            winnerTeamId = match.penalties_home > match.penalties_away ? match.home_team_id : match.away_team_id;
        }

        await connection.query(
            `UPDATE matches SET status = 'finished', winner_team_id = ?, finished_at = NOW() WHERE id = ? AND tournament_id = ?`,
            [winnerTeamId, matchId, tournamentId]
        );

        if (isKnockout && winnerTeamId) {
            const winnerId = winnerTeamId;
            const targetColumn = match.next_match_position === 'home' ? 'home_team_id' : 'away_team_id';
            // El siguiente partido debe ser del mismo torneo
            const [upd] = await connection.query<ResultSetHeader>(
                `UPDATE matches SET ${targetColumn} = ? WHERE id = ? AND tournament_id = ?`,
                [winnerId, match.next_match_id, tournamentId]
            );
            if (upd.affectedRows === 0) {
                throw new AppError(400, 'El siguiente partido de la llave no existe en este torneo');
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
