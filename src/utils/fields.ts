/** Devuelve solo las llaves permitidas del body (evita mass assignment). */
export function pickAllowed(body: any, allowed: readonly string[]) {
    const out: Record<string, any> = {};
    if (!body || typeof body !== 'object') return out;
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
    }
    return out;
}

/** Arma "col1 = ?, col2 = ?" solo con columnas de la lista blanca. */
export function buildSet(fields: Record<string, any>, allowed: readonly string[]) {
    const keys = Object.keys(fields).filter(k => allowed.includes(k));
    return {
        keys,
        setClause: keys.map(k => `${k} = ?`).join(', '),
        values: keys.map(k => fields[k]),
    };
}
