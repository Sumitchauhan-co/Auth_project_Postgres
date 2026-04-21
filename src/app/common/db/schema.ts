import { getTableColumns } from 'drizzle-orm';
import {
    pgTable,
    uuid,
    varchar,
    boolean,
    timestamp,
    pgEnum,
    text,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);

export const usersTable = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),

    firstName: varchar('first_name', { length: 255 }).notNull(),
    lastName: varchar('last_name', { length: 255 }),

    email: varchar('email', { length: 255 }).notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),

    password: varchar('password', { length: 255 }).notNull(),

    role: userRoleEnum('role').default('user').notNull(),

    refreshToken: text('refresh_token'),
    
    verificationToken : text('verification_token'),

    resetPasswordToken: text('reset_token'),
    resetPasswordExpiry: timestamp('reset_token_expiry', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).$onUpdate(
        () => new Date(),
    ),
});

const { password, ...publicColumns } = getTableColumns(usersTable);
export const userPublicColumns = publicColumns;
