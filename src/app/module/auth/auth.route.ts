import express from 'express';
import authController from './auth.controller.js';
import { authenticate, forgotPasswordLimiter, validate } from './auth.middleware.js';
import { signinModel, signupModel } from './auth.model.js';

const router = express.Router();

router.post('/signup', validate(signupModel), authController.signup);

router.post('/signin', validate(signinModel), authController.signin);

router.post('/logout', authenticate, authController.logout)

router.post('/refresh', authController.refresh)

router.get('/profile/:id', authController.profile)

router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);

router.post('/reset-password', authController.resetPassword);

router.get('/verify-email', authController.verifyEmail)

export default router;
