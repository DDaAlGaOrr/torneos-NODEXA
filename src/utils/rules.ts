/**
 * Reglas de competición. Se combinan en este orden (cada nivel sobrescribe al anterior):
 *   valores por defecto  <  organizations.config.rules  <  tournaments.rules_config
 */

export type Tiebreaker = 'points' | 'goal_diff' | 'goals_for' | 'goals_against' | 'fair_play' | 'wins';

export interface TournamentRules {
    points: { win: number; draw: number; loss: number };
    /** Puntos de penalización por tarjeta (menos = mejor conducta) */
    fair_play: { yellow: number; red: number };
    /** Partidos de suspensión por roja directa o doble amarilla */
    red_card_suspension_matches: number;
    /** Minutos de descanso (expulsión temporal) por amarilla; 0 = sin descanso */
    yellow_sin_bin_minutes: number;
    /** Duración del partido en minutos (informativo para la captura) */
    match_duration_minutes: number;
    tiebreakers: Tiebreaker[];
}

export const DEFAULT_RULES: TournamentRules = {
    points: { win: 3, draw: 1, loss: 0 },
    fair_play: { yellow: 1, red: 3 },
    red_card_suspension_matches: 1,
    yellow_sin_bin_minutes: 5,
    match_duration_minutes: 90,
    tiebreakers: ['points', 'goal_diff', 'goals_for', 'fair_play'],
};

const TIEBREAKERS: Tiebreaker[] = ['points', 'goal_diff', 'goals_for', 'goals_against', 'fair_play', 'wins'];

/** mysql2 devuelve las columnas JSON de MariaDB como texto. */
export function parseJson(value: any): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

const num = (v: any, fallback: number, min = 0, max = 1000) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Aplica sobre `base` solo los valores válidos de `src`. */
function apply(base: TournamentRules, src: Record<string, any>): TournamentRules {
    const r: TournamentRules = JSON.parse(JSON.stringify(base));
    if (src.points && typeof src.points === 'object') {
        r.points.win = num(src.points.win, r.points.win);
        r.points.draw = num(src.points.draw, r.points.draw);
        r.points.loss = num(src.points.loss, r.points.loss);
    }
    if (src.fair_play && typeof src.fair_play === 'object') {
        r.fair_play.yellow = num(src.fair_play.yellow, r.fair_play.yellow);
        r.fair_play.red = num(src.fair_play.red, r.fair_play.red);
    }
    r.red_card_suspension_matches = num(src.red_card_suspension_matches, r.red_card_suspension_matches, 0, 50);
    r.yellow_sin_bin_minutes = num(src.yellow_sin_bin_minutes, r.yellow_sin_bin_minutes, 0, 60);
    r.match_duration_minutes = num(src.match_duration_minutes, r.match_duration_minutes, 1, 300);
    if (Array.isArray(src.tiebreakers)) {
        const valid = src.tiebreakers.filter((t: any) => TIEBREAKERS.includes(t));
        if (valid.length > 0) r.tiebreakers = Array.from(new Set(valid)) as Tiebreaker[];
    }
    return r;
}

export function resolveRules(orgConfig: any, tournamentRules: any): TournamentRules {
    const org = parseJson(orgConfig);
    return apply(apply(DEFAULT_RULES, parseJson(org.rules)), parseJson(tournamentRules));
}

export interface StandingRow {
    team_name: string;
    Puntos: number; DG: number; GF: number; GC: number; PG: number; fair_play: number;
    [key: string]: any;
}

/** Ordena una tabla según los criterios de desempate; el nombre del equipo es el último criterio. */
export function sortStandings<T extends StandingRow>(rows: T[], tiebreakers: Tiebreaker[]): T[] {
    const value: Record<Tiebreaker, (r: T) => number> = {
        points: r => Number(r.Puntos),
        goal_diff: r => Number(r.DG),
        goals_for: r => Number(r.GF),
        goals_against: r => -Number(r.GC),   // menos goles en contra = mejor
        fair_play: r => -Number(r.fair_play), // menos penalización = mejor
        wins: r => Number(r.PG),
    };
    return [...rows].sort((a, b) => {
        for (const t of tiebreakers) {
            const diff = value[t](b) - value[t](a);
            if (diff !== 0) return diff;
        }
        return String(a.team_name).localeCompare(String(b.team_name), 'es');
    });
}
