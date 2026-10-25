import pool from '../conection/index';
import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { AppError } from '../middlewares/error.handler';
import { resolveRules, TournamentRules } from '../utils/rules';

/** Motivos de las sanciones que genera el sistema; las demás (manuales) nunca se tocan. */
export const AUTO_SANCTION_REASONS = {
    red: 'Tarjeta roja directa',
    doubleYellow: 'Doble amarilla',
} as const;

export async function getRules(tournamentId: number, connection?: PoolConnection): Promise<TournamentRules> {
    const db = connection ?? pool;
    const [rows] = await db.query<RowDataPacket[]>(
        `SELECT t.rules_config, o.config
         FROM tournaments t INNER JOIN organizations o ON o.id = t.organization_id
         WHERE t.id = ?`,
        [tournamentId]
    );
    if (rows.length === 0) throw new AppError(404, 'Torneo no encontrado');
    return resolveRules(rows[0].config, rows[0].rules_config);
}

interface TeamLine {
    team_id: number; group_id: number | null;
    played: number; won: number; drawn: number; lost: number;
    goals_for: number; goals_against: number; fair_play: number;
}

/** Tabla de posiciones de la fase de grupos / liga (solo partidos finalizados). */
async function rebuildStandings(conn: PoolConnection, tournamentId: number, rules: TournamentRules) {
    const [teams] = await conn.query<RowDataPacket[]>(
        `SELECT tt.team_id, gt.group_id
         FROM tournament_teams tt
         LEFT JOIN group_teams gt ON gt.team_id = tt.team_id AND gt.tournament_id = tt.tournament_id
         WHERE tt.tournament_id = ? AND tt.status = 'confirmed'`,
        [tournamentId]
    );
    const lines = new Map<number, TeamLine>();
    for (const t of teams) {
        lines.set(Number(t.team_id), {
            team_id: Number(t.team_id), group_id: t.group_id === null ? null : Number(t.group_id),
            played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, fair_play: 0,
        });
    }

    const [matches] = await conn.query<RowDataPacket[]>(
        `SELECT m.home_team_id, m.away_team_id, m.score_home, m.score_away
         FROM matches m
         INNER JOIN rounds r ON r.id = m.round_id AND r.type = 'group'
         WHERE m.tournament_id = ? AND m.status = 'finished'
           AND m.home_team_id IS NOT NULL AND m.away_team_id IS NOT NULL`,
        [tournamentId]
    );
    for (const m of matches) {
        const sh = Number(m.score_home), sa = Number(m.score_away);
        const sides: [number, number, number][] = [[Number(m.home_team_id), sh, sa], [Number(m.away_team_id), sa, sh]];
        for (const [teamId, gf, gc] of sides) {
            const l = lines.get(teamId);
            if (!l) continue; // equipo dado de baja: no aparece en la tabla
            l.played++;
            l.goals_for += gf;
            l.goals_against += gc;
            if (gf > gc) l.won++; else if (gf === gc) l.drawn++; else l.lost++;
        }
    }

    const [cards] = await conn.query<RowDataPacket[]>(
        `SELECT e.team_id,
                SUM(e.event_type = 'yellow_card') AS yellows,
                SUM(e.event_type = 'red_card') AS reds
         FROM match_events e
         INNER JOIN matches m ON m.id = e.match_id AND m.tournament_id = ? AND m.status = 'finished'
         INNER JOIN rounds r ON r.id = m.round_id AND r.type = 'group'
         WHERE e.event_type IN ('yellow_card', 'red_card')
         GROUP BY e.team_id`,
        [tournamentId]
    );
    for (const c of cards) {
        const l = lines.get(Number(c.team_id));
        if (l) l.fair_play = Number(c.yellows) * rules.fair_play.yellow + Number(c.reds) * rules.fair_play.red;
    }

    await conn.query('DELETE FROM standings WHERE tournament_id = ?', [tournamentId]);
    const values = Array.from(lines.values()).map(l => {
        const points = l.won * rules.points.win + l.drawn * rules.points.draw + l.lost * rules.points.loss;
        return [tournamentId, l.group_id, l.team_id, l.played, l.won, l.drawn, l.lost, points,
            l.goals_for, l.goals_against, l.goals_for - l.goals_against, l.fair_play];
    });
    if (values.length > 0) {
        await conn.query(
            `INSERT INTO standings (tournament_id, group_id, team_id, played, won, drawn, lost, points,
                                    goals_for, goals_against, goal_diff, fair_play_points) VALUES ?`,
            [values]
        );
    }
    return values.length;
}

/** Goles, asistencias y tarjetas por jugador (todas las fases; incluye partidos en curso). */
async function rebuildPlayerStats(conn: PoolConnection, tournamentId: number) {
    const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT player_id,
                SUM(goals) AS goals, SUM(assists) AS assists,
                SUM(yellows) AS yellows, SUM(reds) AS reds
         FROM (
            SELECT e.player_id,
                   (e.event_type = 'goal') AS goals, 0 AS assists,
                   (e.event_type = 'yellow_card') AS yellows, (e.event_type = 'red_card') AS reds
            FROM match_events e
            INNER JOIN matches m ON m.id = e.match_id AND m.tournament_id = ? AND m.status <> 'cancelled'
            WHERE e.player_id IS NOT NULL
            UNION ALL
            SELECT e.assist_player_id, 0, 1, 0, 0
            FROM match_events e
            INNER JOIN matches m ON m.id = e.match_id AND m.tournament_id = ? AND m.status <> 'cancelled'
            WHERE e.assist_player_id IS NOT NULL AND e.event_type = 'goal'
         ) x
         GROUP BY player_id`,
        [tournamentId, tournamentId]
    );

    await conn.query('DELETE FROM player_tournament_stats WHERE tournament_id = ?', [tournamentId]);
    const values = rows
        .filter(r => Number(r.goals) + Number(r.assists) + Number(r.yellows) + Number(r.reds) > 0)
        .map(r => [Number(r.player_id), tournamentId, Number(r.goals), Number(r.assists), Number(r.yellows), Number(r.reds)]);
    if (values.length > 0) {
        await conn.query(
            'INSERT INTO player_tournament_stats (player_id, tournament_id, goals, assists, yellow_cards, red_cards) VALUES ?',
            [values]
        );
    }
    return values.length;
}

/**
 * Sanciones automáticas: roja directa o doble amarilla en el mismo partido = suspensión.
 * Se marca "cumplida" cuando el equipo del jugador termina los partidos de suspensión.
 * Las sanciones apeladas y las manuales no se modifican.
 */
async function rebuildSanctions(conn: PoolConnection, tournamentId: number, rules: TournamentRules) {
    const [expulsions] = await conn.query<RowDataPacket[]>(
        `SELECT e.player_id, e.match_id, e.team_id,
                SUM(e.event_type = 'red_card') AS reds,
                SUM(e.event_type = 'yellow_card') AS yellows
         FROM match_events e
         INNER JOIN matches m ON m.id = e.match_id AND m.tournament_id = ? AND m.status <> 'cancelled'
         WHERE e.player_id IS NOT NULL AND e.event_type IN ('red_card', 'yellow_card')
         GROUP BY e.player_id, e.match_id, e.team_id
         HAVING reds > 0 OR yellows >= 2`,
        [tournamentId]
    );
    const [existing] = await conn.query<RowDataPacket[]>(
        `SELECT id, player_id, match_id, reason, status, matches_suspended
         FROM sanctions WHERE tournament_id = ? AND reason IN (?, ?)`,
        [tournamentId, AUTO_SANCTION_REASONS.red, AUTO_SANCTION_REASONS.doubleYellow]
    );

    const key = (playerId: any, matchId: any) => `${Number(playerId)}-${Number(matchId)}`;
    const current = new Map(existing.map(s => [key(s.player_id, s.match_id), s]));
    const wanted = new Set<string>();
    let created = 0, removed = 0;

    for (const x of expulsions) {
        const k = key(x.player_id, x.match_id);
        wanted.add(k);
        const reason = Number(x.reds) > 0 ? AUTO_SANCTION_REASONS.red : AUTO_SANCTION_REASONS.doubleYellow;
        const s = current.get(k);
        if (!s) {
            await conn.query(
                `INSERT INTO sanctions (player_id, tournament_id, match_id, reason, matches_suspended, status)
                 VALUES (?, ?, ?, ?, ?, 'pending')`,
                [x.player_id, tournamentId, x.match_id, reason, rules.red_card_suspension_matches]
            );
            created++;
        } else if (s.reason !== reason) {
            await conn.query('UPDATE sanctions SET reason = ? WHERE id = ?', [reason, s.id]);
        }
    }
    // La tarjeta se corrigió (se borró el evento): la sanción automática ya no aplica
    for (const [k, s] of current) {
        if (!wanted.has(k)) {
            await conn.query('DELETE FROM sanctions WHERE id = ?', [s.id]);
            removed++;
        }
    }

    // Cumplida = el equipo ya terminó N partidos del torneo después del partido de la sanción
    const [open] = await conn.query<RowDataPacket[]>(
        `SELECT s.id, s.status, s.matches_suspended, p.team_id, sm.id AS match_id,
                sm.status AS match_status, sm.finished_at
         FROM sanctions s
         INNER JOIN players p ON p.id = s.player_id
         INNER JOIN matches sm ON sm.id = s.match_id
         WHERE s.tournament_id = ? AND s.status IN ('pending', 'served') AND s.reason IN (?, ?)`,
        [tournamentId, AUTO_SANCTION_REASONS.red, AUTO_SANCTION_REASONS.doubleYellow]
    );
    for (const s of open) {
        let served = false;
        if (s.match_status === 'finished') {
            const [c] = await conn.query<RowDataPacket[]>(
                `SELECT COUNT(*) AS total FROM matches
                 WHERE tournament_id = ? AND status = 'finished' AND id <> ?
                   AND (home_team_id = ? OR away_team_id = ?)
                   AND (finished_at > ? OR (finished_at = ? AND id > ?))`,
                [tournamentId, s.match_id, s.team_id, s.team_id, s.finished_at, s.finished_at, s.match_id]
            );
            served = Number(c[0].total) >= Number(s.matches_suspended);
        }
        const status = served ? 'served' : 'pending';
        if (status !== s.status) await conn.query('UPDATE sanctions SET status = ? WHERE id = ?', [status, s.id]);
    }

    return { created, removed, total: expulsions.length };
}

/** Estatus de cada jornada según sus partidos. */
async function syncRoundStatus(conn: PoolConnection, tournamentId: number) {
    await conn.query(
        `UPDATE rounds r
         LEFT JOIN (
             SELECT round_id,
                    COUNT(*) AS total,
                    SUM(status IN ('finished', 'cancelled')) AS closed,
                    SUM(status IN ('in_progress', 'finished')) AS started
             FROM matches WHERE tournament_id = ? GROUP BY round_id
         ) x ON x.round_id = r.id
         SET r.status = CASE
             WHEN x.total > 0 AND x.closed = x.total THEN 'finished'
             WHEN x.started > 0 THEN 'in_progress'
             ELSE 'pending' END
         WHERE r.tournament_id = ?`,
        [tournamentId, tournamentId]
    );
}

/**
 * Recalcula todo lo derivado de los resultados de un torneo: tabla, estadísticas de jugadores,
 * sanciones automáticas y estatus de jornadas. Es idempotente: se puede llamar las veces que sea.
 * Debe correr dentro de la transacción del cambio que lo provoca.
 */
export async function rebuildTournament(conn: PoolConnection, tournamentId: number) {
    // Bloquea el torneo: dos recálculos simultáneos del mismo torneo se ejecutan en fila
    await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
    const rules = await getRules(tournamentId, conn);

    const standings = await rebuildStandings(conn, tournamentId, rules);
    const playerStats = await rebuildPlayerStats(conn, tournamentId);
    const sanctions = await rebuildSanctions(conn, tournamentId, rules);
    await syncRoundStatus(conn, tournamentId);

    return { standings, player_stats: playerStats, sanctions };
}

/** Versión con su propia transacción (para el recálculo manual). */
export async function rebuildTournamentStandalone(tournamentId: number) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await rebuildTournament(connection, tournamentId);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
