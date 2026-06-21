import express from 'express';
import authRouter from './auth/auth.route.js';
import cookieParser from 'cookie-parser';
import jose from 'node-jose';
import { PRIVATE_KEY, PUBLIC_KEY } from './auth/utils/cert.js';
import path from 'node:path';
import { db } from '../common/db/index.js';
import {
    usersTable,
    applicationsTable,
    authCodesTable,
} from '../common/db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { JWTClaims } from './auth/utils/user-token.js';
import apiError from '../common/utils/apiError.js';
import { authenticate } from './auth/auth.middleware.js';

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.resolve('public')));

app.use('/api', authRouter);

app.get('/health', (req, res) =>
    res.json({ message: 'Server is healthy', healthy: true }),
);

// ========================================================
// --------------------- OIDC CONFIG ----------------------
// ========================================================

app.get('/.well-known/openid-configuration', (req, res) => {
    const ISSUER = `http://localhost:${process.env.PORT}`;
    return res.json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/o/authenticate`,
        userinfo_endpoint: `${ISSUER}/o/userinfo`,
        jwks_uri: `${ISSUER}/.well-known/jwks.json`,
        token_endpoint: `${ISSUER}/o/token`,
    });
});

app.get('/.well-known/jwks.json', async (_, res) => {
    const key = await jose.JWK.asKey(PUBLIC_KEY, 'pem');
    return res.json({ keys: [key.toJSON()] });
});

// --------------------ADMIN-------------------

app.get('/admin', authenticate, (req, res) => {
    return res.sendFile(path.resolve('public', 'admin.html'));
});

app.post('/admin/applications', authenticate, async (req, res) => {
    const { name, redirectUris } = req.body;

    if (
        !name ||
        !Array.isArray(redirectUris) ||
        redirectUris.length === 0 ||
        redirectUris.some((uri) => typeof uri !== 'string')
    ) {
        throw apiError.badRequest('Valid redirect URIs required');
    }

    if (!req.user?.id) {
        throw apiError.unauthorized('Unauthorized');
    }

    const normalizedRedirectUris = redirectUris.map((uri) => uri.trim());

    const client_id = crypto.randomBytes(16).toString('hex');
    const raw_secret = crypto.randomBytes(32).toString('hex');

    const hashed_secret = await bcrypt.hash(raw_secret, 10);

    await db.insert(applicationsTable).values({
        name,
        clientId: client_id,
        clientSecret: hashed_secret,
        redirectUris: normalizedRedirectUris,
        isActive: true,
        ownerId: req.user?.id,
    });

    return res.status(201).json({
        client_id,
        client_secret: raw_secret,
    });
});

// authorization endpoint

app.get('/o/authenticate', (req, res) => {
    return res.sendFile(path.resolve('public', 'authenticate.html'));
});

app.post('/o/authenticate/sign-in', async (req, res) => {
    const { email, password, client_id, redirect_uri, state } = req.body;

    if (!email || !password || !client_id || !redirect_uri) {
        throw apiError.badRequest('Missing fields');
    }

    // validate client
    const [client] = await db
        .select()
        .from(applicationsTable)
        .where(eq(applicationsTable.clientId, client_id))
        .limit(1);

    if (!client || !client.isActive) {
        throw apiError.unauthorized('Invalid client');
    }

    if (!client.redirectUris.includes(redirect_uri)) {
        throw apiError.badRequest('Invalid redirect_uri');
    }

    // validate user
    const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);

    if (!user) throw apiError.unauthorized('Invalid credentials');

    const hash = crypto.createHash('sha256').update(password).digest('hex');
    if (hash !== user.password) {
        throw apiError.unauthorized('Invalid credentials');
    }

    // generate AUTH CODE
    const code = crypto.randomBytes(32).toString('hex');

    await db.insert(authCodesTable).values({
        code,
        userId: user.id,
        clientId: client_id,
        redirectUri: redirect_uri,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const redirect = new URL(redirect_uri);
    redirect.searchParams.set('code', code);
    if (state) redirect.searchParams.set('state', state);

    return res.redirect(redirect.toString());
});

// token endpoint

app.post('/o/token', async (req, res) => {
    const { code, client_id, client_secret, redirect_uri } = req.body;

    if (!code || !client_id || !client_secret || !redirect_uri) {
        throw apiError.badRequest('Missing parameters');
    }

    // validate client
    const [client] = await db
        .select()
        .from(applicationsTable)
        .where(eq(applicationsTable.clientId, client_id))
        .limit(1);

    if (!client || !client.isActive) {
        throw apiError.unauthorized('Invalid client');
    }

    const validSecret = await bcrypt.compare(
        client_secret,
        client.clientSecret,
    );

    if (!validSecret) {
        throw apiError.unauthorized('Invalid client_secret');
    }

    // get auth code
    const [stored] = await db
        .select()
        .from(authCodesTable)
        .where(eq(authCodesTable.code, code))
        .limit(1);

    if (!stored) throw apiError.badRequest('Invalid code');

    if (stored.clientId !== client_id || stored.redirectUri !== redirect_uri) {
        throw apiError.badRequest('Invalid code usage');
    }

    if (new Date() > stored.expiresAt) {
        throw apiError.badRequest('Code expired');
    }

    // get user
    const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, stored.userId))
        .limit(1);

    if (!user) throw apiError.notFound('User not found');

    const ISSUER = `http://localhost:${process.env.PORT}`;
    const now = Math.floor(Date.now() / 1000);

    const payload = {
        iss: ISSUER,
        sub: user.id,
        email: user.email,
        exp: now + 3600,
    };

    const access_token = jwt.sign(payload, PRIVATE_KEY, {
        algorithm: 'RS256',
    });

    const id_token = jwt.sign(
        {
            ...payload,
            name: [user.firstName, user.lastName].join(' '),
        },
        PRIVATE_KEY,
        { algorithm: 'RS256' },
    );

    // delete code (single use)
    await db.delete(authCodesTable).where(eq(authCodesTable.code, code));

    return res.json({
        access_token,
        id_token,
        token_type: 'Bearer',
        expires_in: 3600,
    });
});

// userinfo endpoint

app.get('/o/userinfo', async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        throw apiError.unauthorized('Missing Authorization header');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        throw apiError.unauthorized('Missing Authorization header');
    }

    let payload: any;
    try {
        payload = jwt.verify(token, PUBLIC_KEY, {
            algorithms: ['RS256'],
        });
    } catch {
        throw apiError.unauthorized('Invalid token');
    }

    const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, payload.sub))
        .limit(1);

    if (!user) throw apiError.notFound('User not found');

    res.json({
        sub: user.id,
        email: user.email,
        name: [user.firstName, user.lastName].join(' '),
    });
});

export default app;
