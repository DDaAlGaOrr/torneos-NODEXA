import { Response } from 'express';
import { catchAsync } from '../middlewares/error.handler';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as dashboardService from '../services/dashboard.service';
import { subscribe } from '../utils/live';

/** Cada cuánto se manda un "latido" para que proxies y navegadores no cierren la conexión inactiva */
const HEARTBEAT_MS = 25000;

/** GET /dashboard?tournament_id=N — resumen completo (sin tournament_id: todos los torneos activos) */
export const getSummary = catchAsync(async (req: AuthRequest, res) => {
    const tid = Number(req.query.tournament_id);
    const result = await dashboardService.getSummary(req.user.organization_id, Number.isInteger(tid) && tid > 0 ? tid : null);
    return result ? { code: 200, data: result } : { code: 404, data: { message: 'Torneo no encontrado' } };
});

/**
 * GET /dashboard/stream — Server-Sent Events con los cambios de la liga del usuario.
 * El cliente se conecta con su token en la cabecera Authorization (no en la URL).
 *   event: hello   -> conexión lista
 *   event: change  -> data: { kind, tournament_id, match_id, at }
 */
export const stream = (req: AuthRequest, res: Response) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Nginx: no acumular la respuesta (si no, los avisos llegan tarde)
        'X-Accel-Buffering': 'no',
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    // El navegador reintenta a los 5 s si se cae
    res.write('retry: 5000\n\n');
    send('hello', { organization_id: req.user.organization_id, at: new Date().toISOString() });

    const unsubscribe = subscribe(req.user.organization_id, (change) => {
        const { organization_id, ...payload } = change;
        send('change', payload);
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

    req.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
    });
};
