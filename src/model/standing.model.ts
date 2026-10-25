import pool from '../conection/index';
import { RowDataPacket } from 'mysql2';

/**
 * Lee la tabla guardada en `standings` (la llena recalc.model al cambiar resultados).
 * Parte de los equipos confirmados para que un equipo recién inscrito aparezca con ceros.
 * El grupo se toma de group_teams (asignación actual).
 */
export async function findStandings(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT
            t.id as team_id,
            t.name as team_name,
            t.short_name,
            t.logo_url,
            g.id as group_id,
            g.name as group_name,
            COALESCE(s.played, 0) as PJ,
            COALESCE(s.won, 0) as PG,
            COALESCE(s.drawn, 0) as PE,
            COALESCE(s.lost, 0) as PP,
            COALESCE(s.goals_for, 0) as GF,
            COALESCE(s.goals_against, 0) as GC,
            COALESCE(s.goal_diff, 0) as DG,
            COALESCE(s.points, 0) as Puntos,
            COALESCE(s.fair_play_points, 0) as fair_play
        FROM tournament_teams tt
        INNER JOIN teams t ON tt.team_id = t.id
        LEFT JOIN group_teams gt ON gt.team_id = t.id AND gt.tournament_id = tt.tournament_id
        LEFT JOIN \`groups\` g ON g.id = gt.group_id
        LEFT JOIN standings s ON s.tournament_id = tt.tournament_id AND s.team_id = t.id
        WHERE tt.tournament_id = ? AND tt.status = 'confirmed'
        ORDER BY (g.name IS NULL) ASC, g.name ASC`,
        [tournamentId]
    );
    return rows.map((r): any => ({
        ...r,
        group_id: r.group_id === null ? null : Number(r.group_id),
        PJ: Number(r.PJ), PG: Number(r.PG), PE: Number(r.PE), PP: Number(r.PP),
        GF: Number(r.GF), GC: Number(r.GC), DG: Number(r.DG), Puntos: Number(r.Puntos), fair_play: Number(r.fair_play),
    }));
}
