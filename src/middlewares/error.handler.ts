import { Request, Response, NextFunction, RequestHandler } from 'express';

export class AppError extends Error {
    constructor(
        public statusCode: number,
        public message: string
    ) {
        super(message);
        this.name = 'AppError';
    }
}

// Errores de MySQL que son culpa de los datos enviados, no del servidor
const DB_ERRORS: Record<string, { status: number; message: string }> = {
    ER_ROW_IS_REFERENCED_2: { status: 409, message: 'No se puede eliminar: el registro está en uso por otros datos' },
    ER_NO_REFERENCED_ROW_2: { status: 400, message: 'Hace referencia a un registro que no existe' },
    ER_DUP_ENTRY: { status: 409, message: 'Ya existe un registro con esos datos' },
    ER_DATA_TOO_LONG: { status: 400, message: 'Uno de los valores es demasiado largo' },
};

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            status: 'error',
            message: err.message,
        });
    }

    const dbError = DB_ERRORS[(err as any).code];
    if (dbError) {
        return res.status(dbError.status).json({
            status: 'error',
            message: dbError.message,
        });
    }

    console.error(err);
    return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
    });
};

export const catchAsync = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler => {
    return (req, res, next) => {
        fn(req, res, next)
            .then((result) => {
                if (result !== undefined) {
                    const statusCode = result.code || 200;
                    const data = result.code ? result.data : result;

                    if (statusCode >= 400) {
                        // Mismo formato para todos los errores; data.message se conserva por compatibilidad
                        res.status(statusCode).json({ status: 'error', message: data?.message, data });
                    } else {
                        res.status(statusCode).json({ status: 'ok', data });
                    }
                }
            })
            .catch(next); // Equivale a .catch(err => next(err))
    };
};