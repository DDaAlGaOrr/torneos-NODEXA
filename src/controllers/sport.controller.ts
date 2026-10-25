import { catchAsync } from '../middlewares/error.handler';
import * as sportModel from '../model/sport.model';

export const getAll = catchAsync(async () => {
    return { code: 200, data: await sportModel.findAll() };
});
