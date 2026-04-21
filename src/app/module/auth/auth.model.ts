import z from 'zod';

export const signupModel = z.object({
    firstName: z.string().min(2).max(255),
    lastName: z.string().max(255).nullish(),
    email: z.email().min(6).max(255).transform(val => val.toLocaleLowerCase().trim()),
    password: z.string().min(8).max(255),
});

export const signinModel = z.object({
    email: z.email().min(6).max(255).transform(val => val.toLocaleLowerCase().trim()),
    password: z.string().min(8).max(255),
});
