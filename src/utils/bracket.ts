/**
 * Lógica pura (sin base de datos) para armar cuadros de eliminatoria.
 * Todo lo que se pueda probar de forma aislada vive aquí.
 */

export function nextPowerOfTwo(n: number): number {
    let size = 1;
    while (size < n) size *= 2;
    return size;
}

/**
 * Orden estándar de siembra para un cuadro de `size` posiciones (potencia de 2).
 * standardSeedOrder(8) = [1, 8, 4, 5, 2, 7, 3, 6] -> pares: 1v8, 4v5, 2v7, 3v6
 * Así el 1 y el 2 solo pueden encontrarse en la final.
 */
export function standardSeedOrder(size: number): number[] {
    if (size <= 1) return [1];
    let order = [1, 2];
    while (order.length < size) {
        const n = order.length * 2;
        order = order.flatMap(seed => [seed, n + 1 - seed]);
    }
    return order;
}

export function roundNameFor(teamsInRound: number): string {
    switch (teamsInRound) {
        case 2: return 'Final';
        case 4: return 'Semifinales';
        case 8: return 'Cuartos de final';
        case 16: return 'Octavos de final';
        case 32: return 'Dieciseisavos de final';
        default: return `Ronda de ${teamsInRound}`;
    }
}

export interface PlannedMatch {
    key: string;                       // `${nivel}-${índice}`
    level: number;                     // 1 = primera ronda
    index: number;
    home: number | null;               // team_id o null (por definir)
    away: number | null;
    nextKey: string | null;
    nextPosition: 'home' | 'away' | null;
}

export interface BracketPlan {
    size: number;
    levels: number;
    matches: PlannedMatch[];
    byes: number[];                    // team_ids que pasan directo a la 2ª ronda
}

/**
 * Construye el árbol a partir de las posiciones de la primera ronda.
 * `slots` tiene longitud potencia de 2; null = pase directo (bye) para el rival.
 */
export function buildBracketPlan(slots: (number | null)[]): BracketPlan {
    const size = slots.length;
    if (size < 2 || (size & (size - 1)) !== 0) {
        throw new Error('El número de posiciones debe ser una potencia de 2 (mínimo 2)');
    }
    const levels = Math.log2(size);
    const matches = new Map<string, PlannedMatch>();
    const byes: number[] = [];

    for (let level = 1; level <= levels; level++) {
        const count = size / Math.pow(2, level);
        for (let i = 0; i < count; i++) {
            const key = `${level}-${i}`;
            matches.set(key, {
                key, level, index: i, home: null, away: null,
                nextKey: level < levels ? `${level + 1}-${Math.floor(i / 2)}` : null,
                nextPosition: level < levels ? (i % 2 === 0 ? 'home' : 'away') : null,
            });
        }
    }

    // Primera ronda: equipos reales o byes
    const toRemove: string[] = [];
    for (let i = 0; i < size / 2; i++) {
        const a = slots[2 * i], b = slots[2 * i + 1];
        const m = matches.get(`1-${i}`)!;
        if (a !== null && b !== null) {
            m.home = a; m.away = b;
        } else {
            const advancing = a !== null ? a : b;
            if (advancing === null) throw new Error('Dos pases directos en el mismo cruce: faltan equipos para este tamaño de cuadro');
            byes.push(advancing);
            const parent = matches.get(m.nextKey!)!;
            if (m.nextPosition === 'home') parent.home = advancing; else parent.away = advancing;
            toRemove.push(m.key);
        }
    }
    toRemove.forEach(k => matches.delete(k));

    return { size, levels, matches: Array.from(matches.values()), byes };
}

/** Siembra por lista de equipos ordenada (el primero es el seed 1). */
export function slotsFromSeeds(seededTeamIds: number[]): (number | null)[] {
    const size = nextPowerOfTwo(seededTeamIds.length);
    return standardSeedOrder(size).map(seed => seededTeamIds[seed - 1] ?? null);
}

export interface Qualifier {
    team_id: number;
    group_id: number;
    Puntos: number;
    DG: number;
    GF: number;
}

/**
 * Siembra desde los clasificados de grupos.
 * - 2 por grupo y número de grupos potencia de 2: cruce clásico (1A-2B, 1C-2D, 1D-2C, 1B-2A ...).
 * - Cualquier otro caso: siembra global (primeros de grupo, luego segundos...) con orden estándar.
 * `groups` ya viene ordenado por grupo y cada lista por posición (1º, 2º, ...).
 */
export function slotsFromGroups(groups: Qualifier[][], perGroup: number): { slots: (number | null)[]; method: 'cross' | 'seeded' } {
    const g = groups.length;
    const isPow2 = g >= 2 && (g & (g - 1)) === 0;

    if (perGroup === 2 && isPow2) {
        const pairs = g / 2;
        const a: [number, number][] = [];
        const b: [number, number][] = [];
        for (let k = 0; k < pairs; k++) {
            const X = groups[2 * k], Y = groups[2 * k + 1];
            a.push([X[0].team_id, Y[1].team_id]);   // 1º de X vs 2º de Y
            b.push([Y[0].team_id, X[1].team_id]);   // 1º de Y vs 2º de X
        }
        const order = standardSeedOrder(pairs);
        const firstHalf = order.map(s => a[s - 1]);
        const secondHalf = [...order].reverse().map(s => b[s - 1]);
        return { slots: [...firstHalf, ...secondHalf].flat(), method: 'cross' };
    }

    const ranking: number[] = [];
    for (let pos = 0; pos < perGroup; pos++) {
        const ofPos = groups.map(grp => grp[pos]).filter(Boolean)
            .sort((x, y) => y.Puntos - x.Puntos || y.DG - x.DG || y.GF - x.GF);
        ranking.push(...ofPos.map(q => q.team_id));
    }
    return { slots: slotsFromSeeds(ranking), method: 'seeded' };
}
