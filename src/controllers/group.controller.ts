import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as groupModel from '../model/group.model';
import { verifyTournamentOwnership } from '../model/tournament_team.model';
import { logAudit } from '../utils/audit';
import { notifyChange } from '../utils/live';

const DENIED = { code: 403, data: { message: 'Acceso denegado al torneo' } };

export const create = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    const name = String(req.body.name ?? '').trim();

    if (!name || name.length > 50) {
        return { code: 400, data: { message: 'El nombre del grupo es obligatorio (máx. 50 caracteres)' } };
    }
    if (!(await verifyTournamentOwnership(Number(tournamentId), req.user.organization_id))) return DENIED;
    if (await groupModel.nameExists(Number(tournamentId), name)) {
        return { code: 409, data: { message: 'Ya existe un grupo con ese nombre en el torneo' } };
    }

    return { code: 201, data: await groupModel.create(Number(tournamentId), name) };
});

export const getAll = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    if (!(await verifyTournamentOwnership(Number(tournamentId), req.user.organization_id))) return DENIED;
    return { code: 200, data: await groupModel.findAllByTournament(Number(tournamentId)) };
});

export const rename = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id } = req.params;
    const name = String(req.body.name ?? '').trim();

    if (!name || name.length > 50) {
        return { code: 400, data: { message: 'El nombre del grupo es obligatorio (máx. 50 caracteres)' } };
    }
    if (!(await verifyTournamentOwnership(Number(tournamentId), req.user.organization_id))) return DENIED;
    if (await groupModel.nameExists(Number(tournamentId), name, Number(id))) {
        return { code: 409, data: { message: 'Ya existe un grupo con ese nombre en el torneo' } };
    }

    const ok = await groupModel.rename(Number(id), Number(tournamentId), name);
    return ok
        ? { code: 200, data: { message: 'Grupo actualizado' } }
        : { code: 404, data: { message: 'Grupo no encontrado' } };
});

export const remove = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id } = req.params;
    if (!(await verifyTournamentOwnership(Number(tournamentId), req.user.organization_id))) return DENIED;
    if (!(await groupModel.belongsToTournament(Number(id), Number(tournamentId)))) {
        return { code: 404, data: { message: 'Grupo no encontrado' } };
    }
    if ((await groupModel.countMatchesOfGroup(Number(id), Number(tournamentId))) > 0) {
        return { code: 409, data: { message: 'No se puede eliminar: los equipos del grupo ya tienen partidos de fase de grupos' } };
    }

    await groupModel.remove(Number(id), Number(tournamentId));
    return { code: 200, data: { message: 'Grupo eliminado' } };
});

export const addTeam = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id } = req.params;
    const { team_id } = req.body;

    if (!team_id) return { code: 400, data: { message: 'El team_id es obligatorio' } };
    if (!(await verifyTournamentOwnership(Number(tournamentId), req.user.organization_id))) return DENIED;
    if (!(await groupModel.belongsToTournament(Number(id), Number(tournamentId)))) {
        return { code: 404, data: { message: 'Grupo no encontrado' } };
    }
    if (!(await groupModel.isTeamConfirmed(Number(tournamentId), Number(team_id)))) {
        return { code: 400, data: { message: 'El equipo no está inscrito (confirmado) en este torneo' } };
    }
    const current = await groupModel.groupOfTeam(Number(tournamentId), Number(team_id));
    if (current !== null) {
        return { code: 409, data: { message: 'El equipo ya pertenece a un grupo de este torneo; quítalo primero' } };
    }

    return { code: 201, data: await groupModel.addTeam(Number(id), Number(team_id), Number(tournamentId)) };
});

export const removeTeam = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId, id, teamId } = req.params;
    if (!(await verifyTournamentOwnership(Number(tournamentId), req.user.organization_id))) return DENIED;
    if (!(await groupModel.belongsToTournament(Number(id), Number(tournamentId)))) {
        return { code: 404, data: { message: 'Grupo no encontrado' } };
    }
    if ((await groupModel.countMatchesOfTeam(Number(teamId), Number(tournamentId))) > 0) {
        return { code: 409, data: { message: 'El equipo ya tiene partidos de fase de grupos; no se puede sacar del grupo' } };
    }

    const ok = await groupModel.removeTeam(Number(id), Number(teamId), Number(tournamentId));
    return ok
        ? { code: 200, data: { message: 'Equipo removido del grupo' } }
        : { code: 404, data: { message: 'El equipo no está en ese grupo' } };
});

/** Mueve un equipo al grupo indicado (lo saca del que tenía). Pensado para arrastrar en la pantalla de grupos. */
export const moveTeam = catchAsync(async (req: AuthRequest, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const groupId = Number(req.params.id);
    const teamId = Number(req.params.teamId);
    if (!(await verifyTournamentOwnership(tournamentId, req.user.organization_id))) return DENIED;
    if (!(await groupModel.belongsToTournament(groupId, tournamentId))) {
        return { code: 404, data: { message: 'Grupo no encontrado' } };
    }
    if (!(await groupModel.isTeamConfirmed(tournamentId, teamId))) {
        return { code: 400, data: { message: 'El equipo no está inscrito (confirmado) en este torneo' } };
    }
    const current = await groupModel.groupOfTeam(tournamentId, teamId);
    if (current === groupId) {
        return { code: 200, data: { message: 'El equipo ya está en ese grupo' } };
    }
    if (current !== null && (await groupModel.countMatchesOfTeam(teamId, tournamentId)) > 0) {
        return { code: 409, data: { message: 'El equipo ya tiene partidos de fase de grupos; no se puede cambiar de grupo' } };
    }

    await groupModel.moveTeam(tournamentId, teamId, groupId);
    await logAudit(req.user, {
        action: 'group.move_team', entityType: 'tournament', entityId: tournamentId,
        oldValues: { team_id: teamId, group_id: current }, newValues: { team_id: teamId, group_id: groupId },
    });
    notifyChange({ kind: 'groups', organization_id: req.user.organization_id, tournament_id: tournamentId });
    return { code: 200, data: { message: 'Equipo movido de grupo' } };
});

/** Sorteo automático: crea los grupos y reparte en serpiente a los equipos confirmados. */
export const draw = catchAsync(async (req: AuthRequest, res) => {
    const { tournamentId } = req.params;
    const groupCount = Number(req.body.groups);
    const shuffle = req.body.shuffle === true;

    if (!Number.isInteger(groupCount) || groupCount < 2 || groupCount > 26) {
        return { code: 400, data: { message: 'Indica el número de grupos (entre 2 y 26) en "groups"' } };
    }
    if (!(await verifyTournamentOwnership(Number(tournamentId), req.user.organization_id))) return DENIED;
    if ((await groupModel.countGroups(Number(tournamentId))) > 0) {
        return { code: 409, data: { message: 'El torneo ya tiene grupos; elimínalos para volver a sortear' } };
    }

    const teamIds = await groupModel.confirmedTeamIdsWithoutGroup(Number(tournamentId));
    if (teamIds.length < groupCount * 2) {
        return { code: 400, data: { message: `Se necesitan al menos ${groupCount * 2} equipos confirmados para ${groupCount} grupos (hay ${teamIds.length})` } };
    }
    if (shuffle) {
        for (let i = teamIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]];
        }
    }

    await groupModel.createAndDistribute(Number(tournamentId), groupCount, teamIds);
    notifyChange({ kind: 'groups', organization_id: req.user.organization_id, tournament_id: Number(tournamentId) });
    return { code: 201, data: await groupModel.findAllByTournament(Number(tournamentId)) };
});
