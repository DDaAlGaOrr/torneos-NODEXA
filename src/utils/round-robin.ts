/**
 * Lógica pura (sin base de datos) para armar calendarios "todos contra todos".
 */

export interface Pairing {
    home: number;
    away: number;
}

/**
 * Método del círculo: con n equipos (si es impar se agrega un descanso) salen n-1 jornadas
 * y cada equipo juega una vez por jornada. Alterna local/visitante para que nadie
 * juegue siempre en casa. Con `doubleRound` agrega la vuelta con las localías invertidas.
 * Devuelve una lista de jornadas; cada jornada es una lista de partidos.
 */
export function roundRobin(teamIds: number[], doubleRound = false): Pairing[][] {
    if (teamIds.length < 2) return [];
    const BYE = -1;
    const teams = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, BYE];
    const n = teams.length;
    const rounds: Pairing[][] = [];

    // Localía equilibrada: es local quien lleva menos partidos en casa (empate: alterna)
    const homeGames = new Map<number, number>();
    const pickHome = (a: number, b: number, alt: boolean): Pairing => {
        const ha = homeGames.get(a) ?? 0, hb = homeGames.get(b) ?? 0;
        const aHome = ha !== hb ? ha < hb : !alt;
        const m = aHome ? { home: a, away: b } : { home: b, away: a };
        homeGames.set(m.home, (homeGames.get(m.home) ?? 0) + 1);
        return m;
    };

    // teams[0] queda fijo; el resto rota una posición por jornada
    let rotating = teams.slice(1);
    for (let r = 0; r < n - 1; r++) {
        const current = [teams[0], ...rotating];
        const matches: Pairing[] = [];
        for (let i = 0; i < n / 2; i++) {
            const a = current[i];
            const b = current[n - 1 - i];
            if (a === BYE || b === BYE) continue;
            matches.push(pickHome(a, b, (i + r) % 2 === 1));
        }
        rounds.push(matches);
        rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
    }

    if (doubleRound) {
        const second = rounds.map(round => round.map(m => ({ home: m.away, away: m.home })));
        rounds.push(...second);
    }
    return rounds;
}

/**
 * Une los calendarios de varios grupos: la jornada k contiene la jornada k de cada grupo.
 * Grupos con menos jornadas simplemente no aportan partidos a las últimas.
 */
export function mergeGroupRounds(groups: { groupId: number | null; rounds: Pairing[][] }[]) {
    const total = Math.max(0, ...groups.map(g => g.rounds.length));
    return Array.from({ length: total }, (_, k) =>
        groups.flatMap(g => (g.rounds[k] ?? []).map(m => ({ ...m, groupId: g.groupId })))
    );
}

/** Suma días a una fecha AAAA-MM-DD (sin zonas horarias). */
export function addDays(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
}

export interface Slot {
    field_id: number | null;
    scheduled_at: string;       // 'AAAA-MM-DD HH:MM:00'
}

/**
 * Horarios disponibles de un día: cada hora indicada en cada cancha, ordenados por hora
 * y luego por cancha. `isTaken` descarta los que ya ocupa otro partido.
 */
export function daySlots(
    date: string, times: string[], fieldIds: (number | null)[],
    isTaken: (fieldId: number | null, scheduledAt: string) => boolean
): Slot[] {
    const slots: Slot[] = [];
    for (const t of [...times].sort()) {
        for (const f of fieldIds) {
            const scheduled_at = `${date} ${t}:00`;
            if (!isTaken(f, scheduled_at)) slots.push({ field_id: f, scheduled_at });
        }
    }
    return slots;
}

/** 'AAAA-MM-DD HH:MM[:SS]' -> minutos desde una época fija (para comparar sin zonas horarias). */
export function toMinutes(datetime: string): number {
    const [d, t = '00:00'] = datetime.replace('T', ' ').split(' ');
    const [y, m, day] = d.split('-').map(Number);
    const [hh, mm] = t.split(':').map(Number);
    return Date.UTC(y, m - 1, day, hh, mm) / 60000;
}
