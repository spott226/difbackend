import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:4200'),
  RENAPO_URL: z.string().url().optional(),
  RENAPO_TOKEN: z.string().optional(),
  UPLOAD_DIR: z.string().default('./uploads')
});

export const config = configSchema.parse(process.env);
