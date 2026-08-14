import { Role } from '@prisma/client';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword } from '../security/password.js';

const moduleIdSchema = z.enum([
  'sindis',
  'trabajo-social',
  'consultas',
  'agenda',
  'caja',
  'reportes'
]);

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(50).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(128),
  role: z.nativeEnum(Role).default(Role.CAPTURISTA),
  modules: z.array(moduleIdSchema).default([]),
  active: z.boolean().default(true)
});

const updateUserSchema = createUserSchema.omit({ password: true }).extend({
  password: z.string().min(8).max(128).optional()
});

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  modules: true,
  active: true,
  createdAt: true,
  updatedAt: true
} as const;

function requesterId(request: FastifyRequest) {
  return String((request.user as { sub?: string }).sub || '');
}

async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await prisma.user.findUnique({ where: { id: requesterId(request) } });
  if (!user || !user.active || user.role !== Role.SUPER_ADMIN) {
    return reply.code(403).send({ message: 'Se requiere acceso de superadministrador' });
  }
}

async function protectsLastSuperAdmin(targetId: string, nextRole: Role, nextActive: boolean) {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || target.role !== Role.SUPER_ADMIN || !target.active) return false;
  if (nextRole === Role.SUPER_ADMIN && nextActive) return false;

  const activeSuperAdmins = await prisma.user.count({
    where: { role: Role.SUPER_ADMIN, active: true }
  });
  return activeSuperAdmins <= 1;
}

export async function userRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: [app.authenticate, requireSuperAdmin] };

  app.get('/admin/users', adminOnly, async () => {
    return prisma.user.findMany({
      select: userSelect,
      orderBy: [{ active: 'desc' }, { displayName: 'asc' }]
    });
  });

  app.post('/admin/users', adminOnly, async (request, reply) => {
    const input = createUserSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { username: input.username } });
    if (existing) return reply.code(409).send({ message: 'El nombre de usuario ya existe' });

    return prisma.user.create({
      data: {
        username: input.username,
        displayName: input.displayName,
        passwordHash: await hashPassword(input.password),
        role: input.role,
        modules: input.modules,
        active: input.active
      },
      select: userSelect
    });
  });

  app.put('/admin/users/:id', adminOnly, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = updateUserSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { id: params.id } });
    if (!existing) return reply.code(404).send({ message: 'Usuario no encontrado' });

    const usernameOwner = await prisma.user.findUnique({ where: { username: input.username } });
    if (usernameOwner && usernameOwner.id !== params.id) {
      return reply.code(409).send({ message: 'El nombre de usuario ya existe' });
    }

    if (await protectsLastSuperAdmin(params.id, input.role, input.active)) {
      return reply.code(400).send({ message: 'Debe permanecer al menos un superadministrador activo' });
    }

    const passwordData = input.password
      ? { passwordHash: await hashPassword(input.password) }
      : {};

    return prisma.user.update({
      where: { id: params.id },
      data: {
        username: input.username,
        displayName: input.displayName,
        role: input.role,
        modules: input.modules,
        active: input.active,
        ...passwordData
      },
      select: userSelect
    });
  });

  app.delete('/admin/users/:id', adminOnly, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await prisma.user.findUnique({ where: { id: params.id } });
    if (!existing) return reply.code(404).send({ message: 'Usuario no encontrado' });
    if (params.id === requesterId(request)) {
      return reply.code(400).send({ message: 'No puedes desactivar tu propia cuenta' });
    }
    if (await protectsLastSuperAdmin(params.id, existing.role, false)) {
      return reply.code(400).send({ message: 'Debe permanecer al menos un superadministrador activo' });
    }

    return prisma.user.update({
      where: { id: params.id },
      data: { active: false },
      select: userSelect
    });
  });
}
