import * as bracketModel from '../model/bracket.model';

export async function getTournamentBracket(tournamentId: number) {
    const rows = await bracketModel.getBracketMatches(tournamentId);

    const roundsMap = new Map();

    rows.forEach(row => {
        if (!roundsMap.has(row.round_id)) {
            roundsMap.set(row.round_id, {
                round_id: row.round_id,
                round_name: row.round_name,
                round_order: row.round_order,
                matches: []
            });
        }
        
        if (row.match_id) {
            roundsMap.get(row.round_id).matches.push({
                id: row.match_id,
                status: row.status,
                scheduled_at: row.scheduled_at,
                score_home: row.score_home,
                score_away: row.score_away,
                next_match_id: row.next_match_id,
                next_match_position: row.next_match_position,
                home_team: row.home_team_id ? {
                    id: row.home_team_id,
                    name: row.home_team_name,
                    logo_url: row.home_team_logo
                } : null,
                away_team: row.away_team_id ? {
                    id: row.away_team_id,
                    name: row.away_team_name,
                    logo_url: row.away_team_logo
                } : null
            });
        }
    });

    return Array.from(roundsMap.values());
}