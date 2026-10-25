import { EventEmitter } from 'events';

/**
 * Avisos en vivo dentro del proceso de la API: cuando cambia algo que afecta resultados, tablas,
 * calendario o llaves, se emite un aviso para la liga y los paneles conectados por SSE se actualizan.
 *
 * Limitación: vive en memoria. Con varias instancias de la API detrás de un balanceador habría que
 * repartir los avisos con Redis (pub/sub) u otro canal compartido.
 */
export type LiveChangeKind =
    | 'match_event'      // gol, tarjeta... (cambia el marcador)
    | 'match_finished'
    | 'match_reopened'
    | 'match_updated'    // horario, cancha, estatus
    | 'match_deleted'
    | 'schedule'         // jornadas generadas
    | 'bracket'          // cuadro generado
    | 'groups'
    | 'recalculated'
    | 'sanction';

export interface LiveChange {
    kind: LiveChangeKind;
    organization_id: number;
    tournament_id?: number;
    match_id?: number;
    at: string;
}

const bus = new EventEmitter();
// Un oyente por cada panel conectado; sin límite artificial
bus.setMaxListeners(0);

export function notifyChange(change: Omit<LiveChange, 'at'>) {
    bus.emit('change', { ...change, at: new Date().toISOString() });
}

/** Se suscribe a los avisos de una liga. Devuelve la función para cancelar. */
export function subscribe(organizationId: number, listener: (change: LiveChange) => void) {
    const handler = (change: LiveChange) => {
        if (change.organization_id === organizationId) listener(change);
    };
    bus.on('change', handler);
    return () => bus.off('change', handler);
}

export function listenerCount() {
    return bus.listenerCount('change');
}
