import pool from '../conection/index';
import { PoolConnection } from 'mysql2/promise';

/** Quién hace el cambio (sale del JWT). */
export interface Actor {
    id: number;
    organization_id: number;
}

export interface AuditEntry {
    action: string;          // p. ej. 'match.finish', 'match_event.create'
    entityType: string;      // p. ej. 'match', 'match_event', 'tournament'
    entityId: number;
    oldValues?: any;
    newValues?: any;
}

/**
 * Registra un cambio en audit_logs. Si se pasa la conexión de una transacción,
 * el registro se guarda (o se revierte) junto con el cambio.
 */
export async function logAudit(actor: Actor, entry: AuditEntry, connection?: PoolConnection) {
    const db = connection ?? pool;
    await db.query(
        `INSERT INTO audit_logs (organization_id, user_id, action, entity_type, entity_id, old_values, new_values)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            actor.organization_id, actor.id, entry.action, entry.entityType, entry.entityId,
            entry.oldValues === undefined ? null : JSON.stringify(entry.oldValues),
            entry.newValues === undefined ? null : JSON.stringify(entry.newValues),
        ]
    );
}
