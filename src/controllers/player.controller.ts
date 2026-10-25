import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as playerService from '../services/player.service';
import { pickAllowed } from '../utils/fields';
import { PLAYER_UPDATABLE } from '../model/player.model';

const STATUSES = ['active', 'suspended', 'inactive'];

/** Valida los campos presentes (sirve para crear y editar). Devuelve el mensaje de error o null. */
function validatePlayerFields(f: Record<string, any>): string | null {
    if ('name' in f) {
        const name = String(f.name ?? '').trim();
        if (!name) return 'El nombre del jugador es obligatorio';
        if (name.length > 150) return 'El nombre no puede pasar de 150 caracteres';
    }
    if ('jersey_number' in f && String(f.jersey_number ?? '').trim().length > 5) {
        return 'El número de camiseta no puede pasar de 5 caracteres';
    }
    if ('position' in f && String(f.position ?? '').trim().length > 50) {
        return 'La posición no puede pasar de 50 caracteres';
    }
    if ('status' in f && !STATUSES.includes(f.status)) {
        return `Estatus inválido. Valores permitidos: ${STATUSES.join(', ')}`;
    }
    if ('photo_url' in f) {
        const url = String(f.photo_url ?? '').trim();
        if (url && (url.length > 500 || !/^https?:\/\/\S+$/i.test(url))) return 'La foto debe ser un enlace http(s) válido';
    }
    return null;
}

/** Quita espacios sobrantes de los textos. */
function trimStrings(f: Record<string, any>) {
    for (const k of ['name', 'jersey_number', 'position', 'photo_url']) {
        if (k in f && typeof f[k] === 'string') f[k] = f[k].trim();
    }
    return f;
}

export const create = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;
    const { team_id, name } = req.body;

    if (!team_id || !name) {
        return { code: 400, data: { message: 'El equipo y el nombre son obligatorios' } };
    }

    const fields = trimStrings({ name: req.body.name, jersey_number: req.body.jersey_number ?? '', position: req.body.position ?? '' });
    const invalid = validatePlayerFields(fields);
    if (invalid) return { code: 400, data: { message: invalid } };

    const hasAccess = await playerService.checkTeamAccess(team_id, organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'No tienes permiso para agregar jugadores a este equipo' } };
    }

    if (fields.jersey_number && await playerService.jerseyTaken(Number(team_id), fields.jersey_number)) {
        return { code: 409, data: { message: `El número ${fields.jersey_number} ya lo usa otro jugador del equipo` } };
    }

    const result = await playerService.createPlayer(team_id, fields.name, fields.jersey_number, fields.position);
    return { code: 201, data: result };
});

export const getByTeam = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;
    const teamId = Number(req.params.teamId);

    const hasAccess = await playerService.checkTeamAccess(teamId, organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado a este equipo' } };
    }

    const result = await playerService.getPlayersByTeam(teamId);
    return { code: 200, data: result };
});

export const update = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { team_id } = req.body;
    const updateFields = trimStrings(pickAllowed(req.body, PLAYER_UPDATABLE));
    const organizationId = req.user.organization_id;

    if (!team_id) {
        return { code: 400, data: { message: 'Se requiere el team_id por seguridad' } };
    }

    const hasAccess = await playerService.checkTeamAccess(team_id, organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado' } };
    }

    if (Object.keys(updateFields).length === 0) {
        return { code: 400, data: { message: 'No se enviaron datos para actualizar' } };
    }

    const invalid = validatePlayerFields(updateFields);
    if (invalid) return { code: 400, data: { message: invalid } };

    if (updateFields.jersey_number && await playerService.jerseyTaken(Number(team_id), updateFields.jersey_number, Number(id))) {
        return { code: 409, data: { message: `El número ${updateFields.jersey_number} ya lo usa otro jugador del equipo` } };
    }

    const success = await playerService.updatePlayer(Number(id), Number(team_id), updateFields);
    return success
        ? { code: 200, data: { message: 'Jugador actualizado' } }
        : { code: 404, data: { message: 'Jugador no encontrado' } };
});

export const remove = catchAsync(async (req: AuthRequest, res) => {
    const { id, teamId } = req.params;
    const organizationId = req.user.organization_id;

    const hasAccess = await playerService.checkTeamAccess(Number(teamId), organizationId);
    if (!hasAccess) {
        return { code: 403, data: { message: 'Acceso denegado' } };
    }

    // Sus goles y tarjetas perderían al jugador en las estadísticas
    if ((await playerService.countEvents(Number(id), Number(teamId))) > 0) {
        return { code: 409, data: { message: 'El jugador tiene eventos registrados en partidos (goles, tarjetas...). Márcalo como inactivo en lugar de eliminarlo' } };
    }

    const success = await playerService.deletePlayer(Number(id), Number(teamId));
    return success
        ? { code: 200, data: { message: 'Jugador eliminado' } }
        : { code: 404, data: { message: 'Jugador no encontrado' } };
});
