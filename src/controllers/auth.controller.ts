import { catchAsync, AppError } from '../middlewares/error.handler';
import * as authService from '../services/auth.service'

export const login = catchAsync(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return {
            code: 400,
            data: { message: 'Email y password son obligatorios' }
        };
    }

    const result = await authService.login(email, password);

    if (result) {
        return {
            code: 200,
            data: result
        };
    } else {
        return {
            code: 401,
            data: { message: 'Correo o contraseña incorrectos' }
        };
    }
});
