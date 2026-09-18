import * as teamModel from '../model/team.model';

export async function createTeam(
    organizationId: number, categoryId: number, name: string,
    shortName: string, primaryColor: string, contactEmail: string,
    contactPhone: string, coachIds: number[]
) {
    return await teamModel.create(
        organizationId, categoryId, name, shortName,
        primaryColor, contactEmail, contactPhone, coachIds
    );
}

export async function getTeams(organizationId: number) {
    return await teamModel.findAllByOrganization(organizationId);
}

export async function updateTeam(
    id: number, organizationId: number, categoryId: number, name: string,
    shortName: string, primaryColor: string, contactEmail: string,
    contactPhone: string, coachIds: number[]
) {
    return await teamModel.update(
        id, organizationId, categoryId, name, shortName,
        primaryColor, contactEmail, contactPhone, coachIds
    );
}

export async function deleteTeam(id: number, organizationId: number) {
    return await teamModel.remove(id, organizationId);
}