import * as tournamentModel from '../model/tournament.model';

export async function createTournament(
    organizationId: number, sportId: number, categoryId: number, name: string,
    description: string, format: string, maxTeams: number, rulesConfig: any,
    startDate: string, endDate: string
) {
    return await tournamentModel.create(
        organizationId, sportId, categoryId, name, description,
        format, maxTeams, rulesConfig, startDate, endDate
    );
}

export async function getTournaments(organizationId: number) {
    return await tournamentModel.findAllByOrganization(organizationId);
}

export async function updateTournament(id: number, organizationId: number, updateFields: any) {
    return await tournamentModel.update(id, organizationId, updateFields);
}

export async function deleteTournament(id: number, organizationId: number) {
    return await tournamentModel.remove(id, organizationId);
}