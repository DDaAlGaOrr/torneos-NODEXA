import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as tournamentService from '../services/tournament.service';
import * as tournamentModel from '../model/tournament.model';
import * as sportModel from '../model/sport.model';
import { categoryBelongsToOrg } from '../model/team.model';
import { pickAllowed } from '../utils/fields';
import { TOURNAMENT_UPDATABLE } from '../model/tournament.model';

const FORMATS = ['bracket', 'groups_knockout', 'league', 'mixed'];
const STATUSES = ['draft', 'registration', 'in_progress', 'finished', 'archived', 'cancelled'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const bad = (message: string) => ({ code: 400, data: { message } });

const isRealDate = (v: string) => {
    if (!DATE_RE.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/**
 * Valida y normaliza los campos recibidos. Con `partial` solo revisa los que vienen
 * (editar); sin `partial` exige los obligatorios (crear).
 * Devuelve { error } con el mensaje, o { values } con los datos limpios.
 */
async function parseTournamentBody(body: any, organizationId: number, partial: boolean) {
    const b = body ?? {};
    const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
    const values: Record<string, any> = {};

    if (!partial || has('name')) {
        if (typeof b.name !== 'string' || b.name.trim().length < 3 || b.name.trim().length > 150) {
            return { error: 'El nombre del torneo es obligatorio (entre 3 y 150 caracteres)' };
        }
        values.name = b.name.trim();
    }

    if (!partial || has('sport_id')) {
        const sportId = Number(b.sport_id);
        if (!Number.isInteger(sportId) || sportId <= 0 || !(await sportModel.exists(sportId))) {
            return { error: 'El deporte es obligatorio y debe existir' };
        }
        values.sport_id = sportId;
    }

    if (!partial || has('format')) {
        if (!FORMATS.includes(b.format)) {
            return { error: `Formato inválido. Valores permitidos: ${FORMATS.join(', ')}` };
        }
        values.format = b.format;
    }

    if (has('category_id')) {
        if (b.category_id === null || b.category_id === '') {
            values.category_id = null;
        } else {
            const categoryId = Number(b.category_id);
            if (!Number.isInteger(categoryId) || categoryId <= 0 || !(await categoryBelongsToOrg(categoryId, organizationId))) {
                return { error: 'La categoría no existe en tu liga' };
            }
            values.category_id = categoryId;
        }
    } else if (!partial) {
        values.category_id = null;
    }

    if (has('status')) {
        if (!STATUSES.includes(b.status)) {
            return { error: `Estatus inválido. Valores permitidos: ${STATUSES.join(', ')}` };
        }
        values.status = b.status;
    }

    if (has('max_teams') || !partial) {
        const maxTeams = has('max_teams') ? Number(b.max_teams) : 16;
        // tournaments.max_teams es tinyint unsigned (máximo 255)
        if (!Number.isInteger(maxTeams) || maxTeams < 2 || maxTeams > 255) {
            return { error: 'El máximo de equipos debe ser un número entero entre 2 y 255' };
        }
        values.max_teams = maxTeams;
    }

    if (has('description') || !partial) {
        const description = has('description') && b.description != null ? b.description : '';
        if (typeof description !== 'string' || description.length > 2000) {
            return { error: 'La descripción no puede pasar de 2000 caracteres' };
        }
        values.description = description.trim();
    }

    for (const key of ['start_date', 'end_date'] as const) {
        if (has(key) || !partial) {
            const v = has(key) ? b[key] : null;
            if (v === null || v === '') {
                values[key] = null;
            } else if (typeof v !== 'string' || !isRealDate(v)) {
                return { error: `${key === 'start_date' ? 'La fecha de inicio' : 'La fecha de fin'} debe tener el formato AAAA-MM-DD` };
            } else {
                values[key] = v;
            }
        }
    }

    if (has('rules_config')) values.rules_config = b.rules_config;
    else if (!partial) values.rules_config = null;

    return { values };
}

export const create = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;
    const parsed = await parseTournamentBody(req.body, organizationId, false);
    if (parsed.error) return bad(parsed.error);
    const v = parsed.values!;

    if (await tournamentModel.existsDuplicate(organizationId, v.sport_id, v.category_id, v.name)) {
        return { code: 409, data: { message: 'Ya existe un torneo con ese nombre para ese deporte y categoría' } };
    }

    const result = await tournamentService.createTournament(
        organizationId, v.sport_id, v.category_id, v.name, v.description,
        v.format, v.max_teams, v.rules_config, v.start_date, v.end_date
    );
    return { code: 201, data: result };
});

export const getAll = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;
    const result = await tournamentService.getTournaments(organizationId);

    return { code: 200, data: result };
});

export const update = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const organizationId = req.user.organization_id;
    const updateFields = pickAllowed(req.body, TOURNAMENT_UPDATABLE);

    if (Object.keys(updateFields).length === 0) {
        return bad('No se enviaron datos para actualizar');
    }

    const current = await tournamentModel.findBasic(Number(id), organizationId);
    if (!current) {
        return { code: 404, data: { message: 'Torneo no encontrado o sin permisos' } };
    }

    const parsed = await parseTournamentBody(updateFields, organizationId, true);
    if (parsed.error) return bad(parsed.error);
    const v = parsed.values!;

    const start = 'start_date' in v ? v.start_date : current.start_date;
    const end = 'end_date' in v ? v.end_date : current.end_date;
    if (start && end && end < start) {
        return bad('La fecha de fin no puede ser anterior a la de inicio');
    }

    if (v.max_teams !== undefined) {
        const enrolled = await tournamentModel.countConfirmedTeams(current.id);
        if (v.max_teams < enrolled) {
            return bad(`Ya hay ${enrolled} equipos inscritos; el máximo no puede ser menor`);
        }
    }

    const dupName = v.name ?? current.name;
    const dupSport = v.sport_id ?? current.sport_id;
    const dupCategory = 'category_id' in v ? v.category_id : current.category_id;
    if (await tournamentModel.existsDuplicate(organizationId, dupSport, dupCategory, dupName, current.id)) {
        return { code: 409, data: { message: 'Ya existe un torneo con ese nombre para ese deporte y categoría' } };
    }

    // Con partidos creados, el deporte ya no se puede cambiar (los partidos son de ese deporte)
    if (v.sport_id !== undefined && v.sport_id !== current.sport_id && (await tournamentModel.countMatches(current.id)) > 0) {
        return { code: 409, data: { message: 'El torneo ya tiene partidos; no se puede cambiar su deporte' } };
    }

    const success = await tournamentService.updateTournament(Number(id), organizationId, v);

    if (!success) {
        // MySQL reporta 0 filas afectadas cuando los valores enviados son iguales a los guardados
        return { code: 200, data: { message: 'Sin cambios' } };
    }

    return { code: 200, data: { message: 'Torneo actualizado correctamente' } };
});

export const remove = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const organizationId = req.user.organization_id;

    const current = await tournamentModel.findBasic(Number(id), organizationId);
    if (!current) {
        return { code: 404, data: { message: 'Torneo no encontrado o sin permisos' } };
    }
    if ((await tournamentModel.countMatches(current.id)) > 0) {
        return {
            code: 409,
            data: { message: 'El torneo ya tiene partidos y no se puede eliminar. Puedes cancelarlo o archivarlo.' },
        };
    }

    const success = await tournamentService.deleteTournament(Number(id), organizationId);

    if (!success) {
        return { code: 404, data: { message: 'Torneo no encontrado o sin permisos' } };
    }

    return { code: 200, data: { message: 'Torneo eliminado correctamente' } };
});
