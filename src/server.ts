import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { config } from './config.js';
import { authRoutes } from './modules/auth.js';
import { appointmentRoutes } from './modules/appointments.js';
import { beneficiaryRoutes } from './modules/beneficiaries.js';
import { catalogRoutes } from './modules/catalogs.js';
import { emergencyRoutes } from './modules/emergency.js';
import { renapoRoutes } from './modules/renapo.js';
import { uploadRoutes } from './modules/uploads.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const uploadDir = path.resolve(process.cwd(), config.UPLOAD_DIR);
const publicAssetsDir = path.resolve(process.cwd(), 'public');
const frontendDir = path.resolve(process.cwd(), '../frontend/dist/sindis-frontend/browser');
const publicUrl = new URL(config.PUBLIC_BASE_URL);
const publicFrontendOrigin = `${publicUrl.protocol}//${publicUrl.hostname}:4200`;
const allowedOrigins = new Set([
  config.FRONTEND_ORIGIN,
  publicFrontendOrigin,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://10.1.27.95:3000',
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://192.168.0.195:4200'
]);

function isAllowedOrigin(origin: string) {
  if (allowedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname.endsWith('.trycloudflare.com');
  } catch {
    return false;
  }
}

const app = Fastify({ logger: true });

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      'frame-ancestors': ["'self'", ...allowedOrigins],
      'upgrade-insecure-requests': null
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  xFrameOptions: false
});
await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origen no permitido'), false);
  }
});
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
await app.register(jwt, { secret: config.JWT_SECRET });
await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
await app.register(fastifyStatic, { root: uploadDir, prefix: '/uploads/' });
await app.register(fastifyStatic, { root: publicAssetsDir, prefix: '/assets/', decorateReply: false });

app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ message: 'Sesión no válida' });
    return;
  }
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ message: 'Datos inválidos', issues: error.flatten() });
  }
  app.log.error(error);
  return reply.code(500).send({ message: 'Error interno' });
});

app.get('/health', async () => ({ ok: true, app: 'Servicios Medicos DIF Estatal', module: 'El Gigante Incluyente', time: new Date().toISOString() }));

await app.register(authRoutes, { prefix: '/api' });
await app.register(appointmentRoutes, { prefix: '/api' });
await app.register(beneficiaryRoutes, { prefix: '/api' });
await app.register(catalogRoutes, { prefix: '/api' });
await app.register(renapoRoutes, { prefix: '/api' });
await app.register(uploadRoutes, { prefix: '/api' });
await app.register(emergencyRoutes);
if (fs.existsSync(frontendDir)) {
  await app.register(fastifyStatic, {
    root: frontendDir,
    prefix: '/',
    decorateReply: false
  });
}

await app.listen({ port: config.PORT, host: '0.0.0.0' });
