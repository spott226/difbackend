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
import { Role } from '@prisma/client';
import { config } from './config.js';
import { prisma } from './db.js';
import { verifySignedPhotoUrl } from './security/media-url.js';
import { authRoutes } from './modules/auth.js';
import { appointmentRoutes } from './modules/appointments.js';
import { beneficiaryRoutes } from './modules/beneficiaries.js';
import { catalogRoutes } from './modules/catalogs.js';
import { emergencyRoutes } from './modules/emergency.js';
import { renapoRoutes } from './modules/renapo.js';
import { uploadRoutes } from './modules/uploads.js';
import { userRoutes } from './modules/users.js';

declare module 'fastify' {
  interface FastifyRequest {
    authUser: {
      id: string;
      username: string;
      displayName: string;
      role: Role;
      modules: string[];
      tokenVersion: number;
    } | null;
  }
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

const app = Fastify({
  logger: {
    redact: {
      paths: ['req.url'],
      censor: '[URL REDACTADA]'
    }
  }
});

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
app.addHook('onRequest', async (request, reply) => {
  const pathname = new URL(request.url, 'http://local').pathname;
  if (pathname.startsWith('/uploads/') && !verifySignedPhotoUrl(request.url)) {
    return reply.code(403).send({ message: 'El enlace de la imagen no es válido o ya expiró' });
  }
});
await app.register(fastifyStatic, { root: uploadDir, prefix: '/uploads/' });
await app.register(fastifyStatic, { root: publicAssetsDir, prefix: '/assets/', decorateReply: false });

app.decorateRequest('authUser', null);
app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
    const claims = request.user as { sub?: string; tokenVersion?: number };
    const user = await prisma.user.findUnique({
      where: { id: String(claims.sub || '') },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        modules: true,
        active: true,
        tokenVersion: true
      }
    });
    if (!user?.active || claims.tokenVersion !== user.tokenVersion) {
      throw new Error('Sesión revocada');
    }
    request.authUser = user;
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

await prisma.beneficiary.updateMany({
  where: { emergencyTokenExpiresAt: null },
  data: { emergencyTokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) }
});

await app.register(authRoutes, { prefix: '/api' });
await app.register(userRoutes, { prefix: '/api' });
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
