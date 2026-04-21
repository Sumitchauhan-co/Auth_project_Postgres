import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';

// connect db

export const db = drizzle(process.env.DATABASE_URL!);