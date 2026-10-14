import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { BracketPlan, roundNameFor } from '../utils/bracket';

export async function getBracketMatches(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT 
            r.id as round_id,
            r.name as round_name,
            r.round_order,
            m.id as match_id,
            m.status,
            m.scheduled_at,
            m.score_home,
            m.score_away,
            m.next_match_id,
            m.next_match_position,
            t1.id as home_team_id,
            t1.name as home_team_name,
            t1.logo_url as home_team_logo,
            t2.id as away_team_id,
            t2.name as away_team_name,
            t2.logo_url as away_team_logo
         FROM rounds r
         INNER JOIN matches m ON r.id = m.round_id
         LEFT JOIN teams t1 ON m.home_team_id = t1.id
         LEFT JOIN teams t2 ON m.away_team_id = t2.id
         WHERE r.tournament_id = ?
         ORDER BY r.round_order ASC, m.id ASC`,
        [tournamentId]
    );
    return rows;
}

export async function confirmedTeamIds(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT team_id FROM tournament_teams WHERE tournament_id = ? AND status = 'confirmed' ORDER BY id ASC",
        [tournamentId]
    );
    return rows.map(r => Number(r.team_id));
}

export async function countPendingGroupMatches(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as total
         FROM matches m
         INNER JOIN rounds r ON m.round_id = r.id AND r.type = 'group'
         WHERE m.tournament_id = ? AND m.status NOT IN ('finished', 'cancelled')`,
        [tournamentId]
    );
    return Number(rows[0].total);
}

/** Rondas de eliminatoria existentes con el número de partidos ya iniciados o terminados. */
export async function findBracketRounds(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT r.id, r.name,
                COUNT(m.id) as matches,
                SUM(CASE WHEN m.status IN ('in_progress', 'finished') THEN 1 ELSE 0 END) as started
         FROM rounds r
         LEFT JOIN matches m ON m.round_id = r.id
         WHERE r.tournament_id = ? AND r.type = 'bracket'
         GROUP BY r.id, r.name`,
        [tournamentId]
    );
    return rows.map(r => ({ id: Number(r.id), name: r.name as string, matches: Number(r.matches), started: Number(r.started || 0) }));
}

/**
 * Crea rondas y partidos del plan en una sola transacción (todo o nada).
 * Si `replace` es true, elimina antes el cuadro anterior (sin partidos iniciados).
 */
export async function persistBracket(tournamentId: number, plan: BracketPlan, replaceRoundIds: number[]) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        if (replaceRoundIds.length > 0) {
            await connection.query('DELETE FROM matches WHERE tournament_id = ? AND round_id IN (?)', [tournamentId, replaceRoundIds]);
            await connection.query('DELETE FROM rounds WHERE tournament_id = ? AND id IN (?)', [tournamentId, replaceRoundIds]);
        }

        const [orderRows] = await connection.query<RowDataPacket[]>(
            'SELECT COALESCE(MAX(round_order), 0) as maxOrder FROM rounds WHERE tournament_id = ?', [tournamentId]
        );
        const baseOrder = Number(orderRows[0].maxOrder);
        if (baseOrder + plan.levels > 255) {
            throw Object.assign(new Error('Se excede el número máximo de jornadas del torneo'), { code: 'ROUND_ORDER_OVERFLOW' });
        }

        const rounds: { level: number; id: number; name: string; round_order: number }[] = [];
        for (let level = 1; level <= plan.levels; level++) {
            const teamsInRound = plan.size / Math.pow(2, level - 1);
            const name = roundNameFor(teamsInRound);
            const [r] = await connection.query<ResultSetHeader>(
                "INSERT INTO rounds (tournament_id, group_id, name, round_order, type, status) VALUES (?, NULL, ?, ?, 'bracket', 'pending')",
                [tournamentId, name, baseOrder + level]
            );
            rounds.push({ level, id: r.insertId, name, round_order: baseOrder + level });
        }

        // De la final hacia atrás, para que next_match_id ya exista al insertar
        const idByKey = new Map<string, number>();
        const ordered = [...plan.matches].sort((a, b) => b.level - a.level || a.index - b.index);
        for (const m of ordered) {
            const roundId = rounds.find(r => r.level === m.level)!.id;
            const nextId = m.nextKey ? idByKey.get(m.nextKey)! : null;
            const [r] = await connection.query<ResultSetHeader>(
                `INSERT INTO matches (tournament_id, round_id, home_team_id, away_team_id, status, next_match_id, next_match_position)
                 VALUES (?, ?, ?, ?, 'scheduled', ?, ?)`,
                [tournamentId, roundId, m.home, m.away, nextId, m.nextPosition]
            );
            idByKey.set(m.key, r.insertId);
        }

        // Referencia inversa: de dónde viene cada equipo del partido
        for (const m of plan.matches) {
            if (!m.nextKey) continue;
            const column = m.nextPosition === 'home' ? 'prev_match_home_id' : 'prev_match_away_id';
            await connection.query(`UPDATE matches SET ${column} = ? WHERE id = ?`, [idByKey.get(m.key), idByKey.get(m.nextKey)]);
        }

        await connection.commit();
        return { rounds, matchIds: Object.fromEntries(idByKey) };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
