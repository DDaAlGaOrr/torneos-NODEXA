import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as teamService from '../services/team.service';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface TeamInput {
    name: string; category_id: number; short_name: string; primary_color: string;
    contact_email: string; contact_phone: string; coach_ids: number[];
}

/** Valida y normaliza el cuerpo de crear/editar equipo. Devuelve el error o los datos limpios. */
function parseTeamBody(body: any): { error: string } | { data: TeamInput } {
    const name = String(body?.name ?? '').trim();
    const short_name = String(body?.short_name ?? '').trim();
    const primary_color = String(body?.primary_color ?? '').trim();
    const contact_email = String(body?.contact_email ?? '').trim();
    const contact_phone = String(body?.contact_phone ?? '').trim();
    const category_id = Number(body?.category_id);

    if (!name || !category_id) return { error: 'El nombre del equipo y la categoría son obligatorios' };
    if (name.length > 100) return { error: 'El nombre del equipo no puede pasar de 100 caracteres' };
    if (short_name.length > 10) return { error: 'El nombre corto no puede pasar de 10 caracteres' };
    if (primary_color && !HEX_COLOR.test(primary_color)) return { error: 'El color debe tener el formato #RRGGBB' };
    if (contact_email && (contact_email.length > 150 || !EMAIL.test(contact_email))) return { error: 'El correo de contacto no es válido' };
    if (contact_phone.length > 30) return { error: 'El teléfono no puede pasar de 30 caracteres' };

    const rawCoaches = body?.coach_ids ?? [];
    if (!Array.isArray(rawCoaches) || rawCoaches.some((id: any) => !Number.isInteger(Number(id)) || Number(id) <= 0)) {
        return { error: 'coach_ids debe ser una lista de IDs de entrenadores' };
    }
    const coach_ids = Array.from(new Set(rawCoaches.map(Number))) as number[];

    return { data: { name, category_id, short_name, primary_color, contact_email, contact_phone, coach_ids } };
}

/** Categoría y entrenadores deben ser de la misma organización. */
async function checkReferences(data: TeamInput, organizationId: number): Promise<string | null> {
    if (!(await teamService.categoryBelongsToOrg(data.category_id, organizationId))) {
        return 'La categoría no es válida';
    }
    if ((await teamService.countCoachesOfOrg(data.coach_ids, organizationId)) !== data.coach_ids.length) {
        return 'Uno o más entrenadores no son válidos';
    }
    return null;
}

export const create = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;

    const parsed = parseTeamBody(req.body);
    if ('error' in parsed) return { code: 400, data: { message: parsed.error } };
    const d = parsed.data;

    const refError = await checkReferences(d, organizationId);
    if (refError) return { code: 400, data: { message: refError } };

    const result = await teamService.createTeam(
        organizationId, d.category_id, d.name, d.short_name,
        d.primary_color, d.contact_email, d.contact_phone, d.coach_ids
    );

    return { code: 201, data: result };
});

export const getAll = catchAsync(async (req: AuthRequest, res) => {
    const organizationId = req.user.organization_id;
    const result = await teamService.getTeams(organizationId);

    return { code: 200, data: result };
});

export const update = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const organizationId = req.user.organization_id;

    const parsed = parseTeamBody(req.body);
    if ('error' in parsed) return { code: 400, data: { message: parsed.error } };
    const d = parsed.data;

    const refError = await checkReferences(d, organizationId);
    if (refError) return { code: 400, data: { message: refError } };

    const success = await teamService.updateTeam(
        Number(id), organizationId, d.category_id, d.name, d.short_name,
        d.primary_color, d.contact_email, d.contact_phone, d.coach_ids
    );

    if (!success) {
        return { code: 404, data: { message: 'Equipo no encontrado o sin permisos' } };
    }

    return { code: 200, data: { message: 'Equipo actualizado correctamente' } };
});

export const remove = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const organizationId = req.user.organization_id;

    // Eliminar un equipo borraría también sus partidos, eventos y posiciones
    const history = await teamService.historyOf(Number(id), organizationId);
    if (history.matches > 0) {
        return { code: 409, data: { message: 'El equipo tiene partidos registrados; eliminarlo borraría los resultados de los torneos' } };
    }
    if (history.enrollments > 0) {
        return { code: 409, data: { message: 'El equipo está inscrito en un torneo; dalo de baja del torneo antes de eliminarlo' } };
    }

    const success = await teamService.deleteTeam(Number(id), organizationId);

    if (!success) {
        return { code: 404, data: { message: 'Equipo no encontrado o sin permisos' } };
    }

    return { code: 200, data: { message: 'Equipo eliminado correctamente' } };
});

export const setCaptain = catchAsync(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const organizationId = req.user.organization_id;
    const { player_id = null } = req.body;

    const success = await teamService.setCaptain(
        Number(id), organizationId, player_id === null ? null : Number(player_id)
    );

    if (!success) {
        return { code: 404, data: { message: 'Equipo no encontrado o el jugador no pertenece al equipo' } };
    }
    return { code: 200, data: { message: player_id === null ? 'Capitán removido' : 'Capitán asignado correctamente' } };
});
