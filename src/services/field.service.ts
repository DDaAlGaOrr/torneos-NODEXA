import * as fieldModel from '../model/field.model';

export async function createField(name: string, location: string, mapsUrl: string, organizationId: number) {
    return await fieldModel.create(name, location, mapsUrl, organizationId);
}

export async function getFields(organizationId: number) {
    return await fieldModel.findAllByOrganization(organizationId);
}

export async function updateField(id: number, name: string, location: string, mapsUrl: string, organizationId: number) {
    return await fieldModel.update(id, name, location, mapsUrl, organizationId);
}

export async function deleteField(id: number, organizationId: number) {
    return await fieldModel.remove(id, organizationId);
}