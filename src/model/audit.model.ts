import pool from '../conection/index';
import { RowDataPacket } from 'mysql2';

export interface AuditFilters {
    entity_type?: string;
    entity_id?: number;
    action?: string;
    user_id?: number;
    limit: number;
    offset: number;
}

export async function findByOrganization(organizationId: number, f: AuditFilters) {
    const where = ['a.organization_id = ?'];
    const params: any[] = [organizationId];
    if (f.entity_type) { where.push('a.entity_type = ?'); params.push(f.entity_type); }
    if (f.entity_id) { where.push('a.entity_id = ?'); params.push(f.entity_id); }
    if (f.action) { where.push('a.action = ?'); params.push(f.action); }
    if (f.user_id) { where.push('a.user_id = ?'); params.push(f.user_id); }

    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT a.id, a.action, a.entity_type, a.entity_id, a.old_values, a.new_values, a.created_at,
                a.user_id, u.name AS user_name, u.role AS user_role
         FROM audit_logs a
         INNER JOIN users u ON u.id = a.user_id
         WHERE ${where.join(' AND ')}
         ORDER BY a.id DESC
         LIMIT ? OFFSET ?`,
        [...params, f.limit, f.offset]
    );
    const parse = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);
    return rows.map(r => ({ ...r, old_values: parse(r.old_values), new_values: parse(r.new_values) }));
}
