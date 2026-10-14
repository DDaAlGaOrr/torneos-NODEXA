const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
import * as authModel from './../model/auth.model';
import { AppError } from '../middlewares/error.handler';

import dotenv from 'dotenv';

dotenv.config();

const SECRET = process.env.JWT_SECRET
const EXPIRES = process.env.JWT_EXPIRES_IN

if (!SECRET) {
    throw new Error('JWT_SECRET no está definido en las variables de entorno');
}

export async function login(email: string, password: string) {
    const user = await authModel.findByEmail(email);
    if (!user) {
        return false
    }
    if (!user.active) {
        return false
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        return false
    }

    const payload = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organization_id: user.organization_id,
    };

    const token = jwt.sign(payload, SECRET, { expiresIn: EXPIRES, algorithm: 'HS256' });

    return {
        token,
        user: payload,
    };
}

export function verifyToken(token: string) {
    return jwt.verify(token, SECRET, { algorithms: ['HS256'] });

}