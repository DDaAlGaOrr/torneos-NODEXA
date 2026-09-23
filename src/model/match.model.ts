import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { AppError } from '../middlewares/error.handler';
export async function verifyTournamentOwnership(tournamentId: number, organizationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM tournaments WHERE id = ? AND organization_id = ?',
        [tournamentId, organizationId]
    );
    return rows.length > 0;
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

export async function update(id: number, updateFields: any) {
    const fields = Object.keys(updateFields);
    if (fields.length === 0) return false;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = Object.values(updateFields);

    const [result] = await pool.query<ResultSetHeader>(
        `UPDATE matches SET ${setClause} WHERE id = ?`,
        [...values, id]
    );
    return result.affectedRows > 0;
}

export async function remove(id: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM matches WHERE id = ?',
        [id]
    );
    return result.affectedRows > 0;
}

export async function finishAndAdvance(matchId: number) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT home_team_id, away_team_id, score_home, score_away, penalties_home, penalties_away, next_match_id, next_match_position 
             FROM matches WHERE id = ?`,
            [matchId]
        );

        if (rows.length === 0) throw new AppError(400, 'Partido no encontrado');
        const match = rows[0];

        if (match.next_match_id && match.next_match_position) {
            if (match.score_home === match.score_away) {
                if (match.penalties_home === null || match.penalties_away === null) {
                    throw new  AppError(400,'Partido de eliminatoria empatado. Registra el resultado de los penales antes de finalizar.');
                }
                if (match.penalties_home === match.penalties_away) {
                    throw new AppError(400,'El partido no puede finalizar empatado en penales.');
                }
            }
        }

        await connection.query(
            `UPDATE matches SET status = 'finished' WHERE id = ?`,
            [matchId]
        );

        if (match.next_match_id && match.next_match_position) {
            let winnerId: number | null = null;

            if (match.score_home > match.score_away) {
                winnerId = match.home_team_id;
            } else if (match.score_away > match.score_home) {
                winnerId = match.away_team_id;
            } else if (match.score_home === match.score_away) {
                if (match.penalties_home > match.penalties_away) {
                    winnerId = match.home_team_id;
                } else {
                    winnerId = match.away_team_id;
                }
            }

            if (winnerId) {
                const targetColumn = match.next_match_position === 'home' ? 'home_team_id' : 'away_team_id';
                await connection.query(
                    `UPDATE matches SET ${targetColumn} = ? WHERE id = ?`,
                    [winnerId, match.next_match_id]
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
