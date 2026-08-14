import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { verifyPassword } from '../security/password.js';

const dummyPasswordHash = '$2a$12$M6pE4Mw8r7iY0fN8K8sK5uUlKdfQZ0OM8i3E6VQPRHeXxq8XnjD9q';

const loginSchema = z.object({
  username: z.string().min(3).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8),
  remember: z.boolean().optional().default(false)
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', {
    config: {
      rateLimit: {
        max: 8,
        timeWindow: '1 minute'
      }
    }
  }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { username: input.username } });

    const validPassword = await verifyPassword(input.password, user?.passwordHash || dummyPasswordHash);
    if (!user || !user.active || !validPassword) {
      return reply.code(401).send({ message: 'Usuario o contraseña incorrectos' });
    }

    const token = await reply.jwtSign({
      sub: user.id,
      username: user.username,
      role: user.role,
      modules: user.modules,
      tokenVersion: user.tokenVersion
    }, {
      expiresIn: input.remember ? '7d' : '2h'
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        modules: user.modules
      }
    };
  });

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = String((request.user as { sub?: string }).sub || '');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, role: true, modules: true, active: true }
    });
    if (!user?.active) return reply.code(401).send({ message: 'La cuenta ya no está activa' });
    return user;
  });
}
