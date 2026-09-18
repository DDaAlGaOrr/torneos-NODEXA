import * as categoryModel from '../model/category.model';

export async function createCategory(name: string, organizationId: number) {
    return await categoryModel.create(name, organizationId);
}

export async function getCategories(organizationId: number) {
    return await categoryModel.findAllByOrganization(organizationId);
}

export async function updateCategory(id: number, name: string, organizationId: number) {
    return await categoryModel.update(id, name, organizationId);
}

export async function deleteCategory(id: number, organizationId: number) {
    return await categoryModel.remove(id, organizationId);
}