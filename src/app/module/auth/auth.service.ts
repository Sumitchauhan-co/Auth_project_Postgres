import { and, eq, getTableColumns, gt, sql } from 'drizzle-orm';
import { db } from '../../common/db/index.js';
import { userPublicColumns, usersTable } from '../../common/db/schema.js';
import apiError from '../../common/utils/apiError.js';
import bcrypt from 'bcryptjs';
import {
    compareUserPassword,
    generateAccessToken,
    generateHashedToken,
    generateHashPassword,
    generateRefreshToken,
    generateToken,
    verifyRefreshToken,
} from './utils/token.js';
import nodemailer from 'nodemailer';
import { transporter } from './utils/mail.js';

export const signupService = async ({
    firstName,
    lastName,
    email,
    password,
}: {
    firstName: string;
    lastName?: string | null | undefined;
    email: string;
    password: string;
}) => {
    const existingUser = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email));

    if (existingUser.length > 0) {
        throw apiError.conflict(
            'Signup failed. Please check your details or try logging in',
        );
    }

    const hashedPassword = await generateHashPassword(password);

    return await db.transaction(async (tx) => {
        const [user] = await tx
            .insert(usersTable)
            .values({
                firstName,
                lastName,
                email,
                password: hashedPassword,
            })
            .returning({
                id: usersTable.id,
                firstName: usersTable.firstName,
                lastName: usersTable.lastName,
                email: usersTable.email,
                emailVerified: usersTable.emailVerified,
                role: usersTable.role,
                createdAt: usersTable.createdAt,
            });

        if (!user) {
            throw apiError.badRequest('Failed to create a user');
        }

        const refreshToken = await generateRefreshToken({
            id: user.id,
            role: user.role,
        });
        const accessToken = await generateAccessToken({
            id: user.id,
            role: user.role,
        });

        const { hashedToken, token } = await generateToken();

        try {
            const info = await transporter.sendMail({
                to: user.email,
                subject: 'Verify your email',
                html: `<a href="http://localhost:3000/verify-email?token=${token}">Verify Email</a>`,
            });

            console.log('Message sent: %s', info.messageId);
            console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
        } catch (err) {
            console.error('Error while sending mail:', err);
        }

        await tx
            .update(usersTable)
            .set({ refreshToken, verificationToken: hashedToken })
            .where(eq(usersTable.id, user.id));

        return { user: { ...user, refreshToken }, accessToken };
    });
};

export const signinService = async ({
    email,
    password,
}: {
    email: string;
    password: string;
}) => {
    const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email));

    if (!user) {
        throw apiError.notFound('User not found, invalid email or username');
    }

    const validPassword = await compareUserPassword(password, user.password);

    if (!validPassword) {
        throw apiError.badRequest('Invalid password');
    }

    const refreshToken = await generateRefreshToken({
        id: user.id,
        role: user.role,
    });
    const accessToken = await generateAccessToken({
        id: user.id,
        role: user.role,
    });

    const [updatedUser] = await db
        .update(usersTable)
        .set({ refreshToken })
        .where(eq(usersTable.id, user.id))
        .returning({
            id: usersTable.id,
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
            email: usersTable.email,
            role: usersTable.role,
            emailVerified: usersTable.emailVerified,
            refreshToken: usersTable.refreshToken,
            createdAt: usersTable.createdAt,
        });

    if (!updatedUser) {
        throw apiError.badRequest('Failed to create a user');
    }

    return { user: updatedUser, accessToken };
};

export const logoutService = async (user: { id: string; role: string }) => {
    await db
        .update(usersTable)
        .set({ refreshToken: null })
        .where(eq(usersTable.id, user.id));
};

export const refreshService = async (refreshToken: string) => {
    const decoded = (await verifyRefreshToken(refreshToken)) as {
        id: string;
        role: string;
    };

    if (!decoded || !decoded.id) {
        throw apiError.unauthorized('Invalid refresh token');
    }

    const [user] = await db
        .select(userPublicColumns)
        .from(usersTable)
        .where(eq(usersTable.id, decoded.id));

    if (!user || user.refreshToken !== refreshToken) {
        throw apiError.unauthorized('Token is invalid or has been revoked');
    }

    const accessToken = await generateAccessToken({
        id: user.id,
        role: user.role,
    });

    const newRefreshToken = await generateRefreshToken({
        id: user.id,
        role: user.role,
    });

    const [updatedUser] = await db
        .update(usersTable)
        .set({ refreshToken: newRefreshToken })
        .where(eq(usersTable.id, user.id))
        .returning({
            id: usersTable.id,
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
            email: usersTable.email,
            role: usersTable.role,
            emailVerified: usersTable.emailVerified,
            refreshToken: usersTable.refreshToken,
            createdAt: usersTable.createdAt,
        });

    return { user: updatedUser, accessToken };
};

export const profileService = async (userId: string) => {
    const [user] = await db
        .select(userPublicColumns)
        .from(usersTable)
        .where(eq(usersTable.id, userId));

    if (!user) {
        throw apiError.notFound('User not found');
    }

    return user;
};

export const forgotPasswordService = async (email: string) => {
    const { token, hashedToken } = await generateToken();

    await db.transaction(async (tx) => {
        const [user] = await tx
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.email, email));

        if (!user) {
            throw apiError.badRequest('Invalid email');
        }

        await tx
            .update(usersTable)
            .set({
                resetPasswordToken: hashedToken,
                resetPasswordExpiry: sql`NOW() + INTERVAL '5 minutes'`,
            })
            .where(eq(usersTable.email, email));
    });

    const resetURL = `${process.env.BASE_URL}/reset-password?token=${token}`;

    // nodemailer logic

    try {
        const info = await transporter.sendMail({
            from: process.env.SENDER_EMAIL,
            to: email,
            subject: 'Reset your password',
            html: `<p>You can reset your password from the link : <a href="${resetURL}">Reset Pasword</a></p><br><p><b>NOTE : </b>Link is valid for 5 mins.</p>`,
        });

        console.log('Message sent: %s', info.messageId);
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    } catch (err) {
        console.error('Error while sending mail:', err);
    }

    return;
};

export const resetPasswordService = async ({
    token,
    newPassword,
}: {
    token: string;
    newPassword: string;
}) => {
    const hashedToken = await generateHashedToken(token);

    const [user] = await db
        .select(userPublicColumns)
        .from(usersTable)
        .where(
            and(
                eq(usersTable.resetPasswordToken, hashedToken),
                gt(usersTable.resetPasswordExpiry, new Date()),
            ),
        )
        .limit(1);

    if (!user) {
        throw apiError.badRequest('Invalid or expired token');
    }

    const newHashPassword = await generateHashPassword(newPassword);

    const [updatedUser] = await db
        .update(usersTable)
        .set({
            password: newHashPassword,
            resetPasswordToken: null,
            resetPasswordExpiry: null,
        })
        .where(eq(usersTable.id, user.id))
        .returning();

    return updatedUser;
};

export const verifyEmailService = async (token: string) => {
    const hashToken = await generateHashedToken(token)

    const [updatedUser] = await db
        .update(usersTable)
        .set({
            emailVerified: true,
            verificationToken: null,
        })
        .where(eq(usersTable.verificationToken, hashToken))
        .returning();

    if (!updatedUser) {
        throw apiError.notFound('Invalid or expired verification token');
    }
    return {user: updatedUser};
};
