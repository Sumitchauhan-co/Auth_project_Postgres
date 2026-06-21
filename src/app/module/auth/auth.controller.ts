import type { Request, Response } from 'express';
import {
    forgotPasswordService,
    logoutService,
    profileService,
    refreshService,
    resetPasswordService,
    signinService,
    signupService,
    verifyEmailService,
} from './auth.service.js';
import apiResponse from '../../common/utils/apiResponse.js';
import apiError from '../../common/utils/apiError.js';
import type { CookieOptions } from 'express';

const signup = async (req: Request, res: Response) => {
    const { user, accessToken } = await signupService(req.body);

    const cookieOptions: CookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
    };

    res.cookie('refreshToken', user.refreshToken, cookieOptions);

    return apiResponse.created(res, 'User created successfully', {
        user,
        accessToken,
    });
};

const signin = async (req: Request, res: Response) => {
    const { user, accessToken } = await signinService(req.body);

    const cookieOptions: CookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
    };

    res.cookie('refreshToken', user.refreshToken, cookieOptions);

    return apiResponse.ok(res, 'User created successfully', {
        user,
        accessToken,
    });
};

const logout = async (req: Request, res: Response) => {
    const user = req.user!;

    if (!user) {
        throw apiError.notFound('User not found');
    }

    await logoutService(user);

    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
    });

    return apiResponse.ok(res, 'User logged out successsfully');
};

const refresh = async (req: Request, res: Response) => {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
        throw apiError.unauthorized('Invalid or expired token');
    }

    const { accessToken, user } = await refreshService(refreshToken);

    return apiResponse.ok(res, 'Token refreshed successfully', {
        accessToken,
        user,
    });
};

const profile = async (req: Request, res: Response) => {
    const id = req.params.id;

    if (!id || Array.isArray(id)) {
        throw apiError.notFound('Profile not found');
    }

    const user = await profileService(id);

    return apiResponse.ok(res, 'User profile fetched successfully', { user });
};

const forgotPassword = async (req: Request, res: Response) => {
    const email = req.body.email;

    if (!email) {
        throw apiError.notFound('Email not found');
    }

    await forgotPasswordService(email);

    return apiResponse.ok(
        res,
        'Email sent successfully to the existing account',
    );
};

const resetPassword = async (req: Request, res: Response) => {
    const { newPassword, confirmPassword } = req.body;
    const token = req.query.token as string;

    if (newPassword !== confirmPassword) {
        throw apiError.badRequest('Password incorrect');
    }

    if (!token || Array.isArray(token)) {
        throw apiError.unauthorized('Invalid token');
    }

    const user = await resetPasswordService({ token, newPassword });

    return apiResponse.ok(res, 'Password reset successfully', { user });
};

const verifyEmail = async (req: Request, res: Response) => {
    const token = req.query.token as string;

    if (!token || Array.isArray(token)) {
        throw apiError.unauthorized('Invalid token');
    }

    const {user} = await verifyEmailService(token);

    return apiResponse.ok(res, 'Email verified successfully', { user });
};

export default {
    signup,
    signin,
    logout,
    refresh,
    profile,
    forgotPassword,
    resetPassword,
    verifyEmail
};
