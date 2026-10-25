import pool from '../conection/index';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function nameExists(tournamentId: number, name: string, excludeId?: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM `groups` WHERE tournament_id = ? AND name = ? AND id <> ?',
        [tournamentId, name, excludeId ?? 0]
    );
    return rows.length > 0;
}

export async function create(tournamentId: number, name: string) {
    const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO `groups` (tournament_id, name) VALUES (?, ?)',
        [tournamentId, name]
    );
    return { id: result.insertId, tournament_id: tournamentId, name };
}

/** Saca al equipo de su grupo actual (si tiene) y lo mete en `groupId`, en una sola transacción. */
export async function moveTeam(tournamentId: number, teamId: number, groupId: number) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM group_teams WHERE tournament_id = ? AND team_id = ?', [tournamentId, teamId]);
        await connection.query(
            'INSERT INTO group_teams (group_id, team_id, tournament_id) VALUES (?, ?, ?)',
            [groupId, teamId, tournamentId]
        );
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

/** Grupos del torneo con sus equipos. */
export async function findAllByTournament(tournamentId: number) {
    const [groups] = await pool.query<RowDataPacket[]>(
        'SELECT id, name FROM `groups` WHERE tournament_id = ? ORDER BY name ASC, id ASC',
        [tournamentId]
    );
    const [teams] = await pool.query<RowDataPacket[]>(
        `SELECT gt.group_id, t.id as team_id, t.name, t.short_name, t.logo_url, t.primary_color
         FROM group_teams gt
         INNER JOIN teams t ON gt.team_id = t.id
         WHERE gt.tournament_id = ?
         ORDER BY t.name ASC`,
        [tournamentId]
    );
    return groups.map(g => ({
        id: Number(g.id) as number,
        name: String(g.name) as string,
        teams: teams.filter(t => Number(t.group_id) === Number(g.id)),
    }));
}

export async function rename(id: number, tournamentId: number, name: string) {
    const [result] = await pool.query<ResultSetHeader>(
        'UPDATE `groups` SET name = ? WHERE id = ? AND tournament_id = ?',
        [name, id, tournamentId]
    );
    return result.affectedRows > 0;
}

export async function belongsToTournament(groupId: number, tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM `groups` WHERE id = ? AND tournament_id = ?',
        [groupId, tournamentId]
    );
    return rows.length > 0;
}

/** Partidos de fase de grupos en los que juega algún equipo del grupo. */
export async function countMatchesOfGroup(groupId: number, tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT m.id) as total
         FROM matches m
         INNER JOIN rounds r ON m.round_id = r.id AND r.type = 'group'
         INNER JOIN group_teams gt ON gt.group_id = ? AND (gt.team_id = m.home_team_id OR gt.team_id = m.away_team_id)
         WHERE m.tournament_id = ?`,
        [groupId, tournamentId]
    );
    return Number(rows[0].total);
}

export async function countMatchesOfTeam(teamId: number, tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as total
         FROM matches m
         INNER JOIN rounds r ON m.round_id = r.id AND r.type = 'group'
         WHERE m.tournament_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?)`,
        [tournamentId, teamId, teamId]
    );
    return Number(rows[0].total);
}

export async function remove(id: number, tournamentId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM `groups` WHERE id = ? AND tournament_id = ?',
        [id, tournamentId]
    );
    return result.affectedRows > 0;
}

export async function isTeamConfirmed(tournamentId: number, teamId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM tournament_teams WHERE tournament_id = ? AND team_id = ? AND status = 'confirmed'",
        [tournamentId, teamId]
    );
    return rows.length > 0;
}

export async function groupOfTeam(tournamentId: number, teamId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT group_id FROM group_teams WHERE tournament_id = ? AND team_id = ?',
        [tournamentId, teamId]
    );
    return rows.length > 0 ? Number(rows[0].group_id) : null;
}

export async function addTeam(groupId: number, teamId: number, tournamentId: number) {
    await pool.query(
        'INSERT INTO group_teams (group_id, team_id, tournament_id) VALUES (?, ?, ?)',
        [groupId, teamId, tournamentId]
    );
    return { group_id: groupId, team_id: teamId, tournament_id: tournamentId };
}

export async function removeTeam(groupId: number, teamId: number, tournamentId: number) {
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM group_teams WHERE group_id = ? AND team_id = ? AND tournament_id = ?',
        [groupId, teamId, tournamentId]
    );
    return result.affectedRows > 0;
}

export async function confirmedTeamIdsWithoutGroup(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT tt.team_id
         FROM tournament_teams tt
         WHERE tt.tournament_id = ? AND tt.status = 'confirmed'
           AND tt.team_id NOT IN (SELECT team_id FROM group_teams WHERE tournament_id = ?)
         ORDER BY tt.id ASC`,
        [tournamentId, tournamentId]
    );
    return rows.map(r => Number(r.team_id));
}

export async function countGroups(tournamentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) as total FROM `groups` WHERE tournament_id = ?',
        [tournamentId]
    );
    return Number(rows[0].total);
}

/** Sorteo: crea N grupos (Grupo A, B, ...) y reparte los equipos confirmados sin grupo en serpiente. */
export async function createAndDistribute(tournamentId: number, groupCount: number, teamIds: number[]) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const groupIds: { id: number; name: string }[] = [];
        for (let i = 0; i < groupCount; i++) {
            const name = `Grupo ${String.fromCharCode(65 + i)}`;
            const [r] = await connection.query<ResultSetHeader>(
                'INSERT INTO `groups` (tournament_id, name) VALUES (?, ?)', [tournamentId, name]
            );
            groupIds.push({ id: r.insertId, name });
        }
        // Serpiente: A B C C B A A B C ...
        for (let i = 0; i < teamIds.length; i++) {
            const lap = Math.floor(i / groupCount);
            const pos = i % groupCount;
            const gi = lap % 2 === 0 ? pos : groupCount - 1 - pos;
            await connection.query(
                'INSERT INTO group_teams (group_id, team_id, tournament_id) VALUES (?, ?, ?)',
                [groupIds[gi].id, teamIds[i], tournamentId]
            );
        }
        await connection.commit();
        return groupIds;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
