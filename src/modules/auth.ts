import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { verifyPassword } from '../security/password.js';

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

    if (!user || !user.active || !(await verifyPassword(input.password, user.passwordHash))) {
      return reply.code(401).send({ message: 'Usuario o contraseña incorrectos' });
    }

    const token = await reply.jwtSign({
      sub: user.id,
      username: user.username,
      role: user.role
    }, {
      expiresIn: input.remember ? '7d' : '2h'
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role
      }
    };
  });

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    return request.user;
  });
}
