import type { Request, Response, NextFunction } from 'express';
import apiError from '../../common/utils/apiError.js';
import type z from 'zod';
import { verifyAccessToken } from './utils/token.js';
import { usersTable } from '../../common/db/schema.js';
import { db } from '../../common/db/index.js';
import { eq } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';

export const validate =
    (schema: z.ZodType) =>
    async (req: Request, res: Response, next: NextFunction) => {
        const result = await schema.safeParseAsync(req.body);

        if (result.error) {
            throw apiError.badRequest('Validation error', result.error.issues);
        }

        req.body = result.data;
        next();
    };

export const authenticate = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const header = req.headers['authorization'];

        if (!header || !header.startsWith('Bearer ')) {
            throw apiError.badRequest('Invalid authorization header');
        }

        const token = header.split(' ')[1];
        if (!token) {
            throw apiError.unauthorized('Not authorized for the action');
        }

        const decoded = (await verifyAccessToken(token)) as {
            id: string;
            role: string;
        };

        const [user] = await db
            .select({
                id: usersTable.id,
                role: usersTable.role,
            })
            .from(usersTable)
            .where(eq(usersTable.id, decoded.id));

        if (!user) {
            throw apiError.unauthorized('User no longer exists');
        }

        req.user = {
            id: user.id,
            role: user.role,
        };

        next();
    } catch (error) {
        next(apiError.unauthorized('Invalid or expired token'));
    }
};

export const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    message: {
        message: 'Too many password reset attempts! Try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
