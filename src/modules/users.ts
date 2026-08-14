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

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(50).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(3).max(120),
  employeeNumber: optionalText(50),
  area: optionalText(100),
  jobTitle: optionalText(100),
  email: z.union([z.string().trim().email(), z.literal('')]).optional().transform((value) => value || null),
  phone: optionalText(30),
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
  employeeNumber: true,
  area: true,
  jobTitle: true,
  email: true,
  phone: true,
  role: true,
  modules: true,
  active: true,
  createdAt: true,
  updatedAt: true
} as const;

function requesterId(request: FastifyRequest) {
  return request.authUser?.id || '';
}

async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.authUser?.role !== Role.SUPER_ADMIN) {
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
        employeeNumber: input.employeeNumber,
        area: input.area,
        jobTitle: input.jobTitle,
        email: input.email,
        phone: input.phone,
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

    const sessionData = input.password
      ? { passwordHash: await hashPassword(input.password), tokenVersion: { increment: 1 } }
      : {};

    return prisma.user.update({
      where: { id: params.id },
      data: {
        username: input.username,
        displayName: input.displayName,
        employeeNumber: input.employeeNumber,
        area: input.area,
        jobTitle: input.jobTitle,
        email: input.email,
        phone: input.phone,
        role: input.role,
        modules: input.modules,
        active: input.active,
        ...sessionData
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
      data: { active: false, tokenVersion: { increment: 1 } },
      select: userSelect
    });
  });

  app.get('/admin/reports/summary', adminOnly, async () => {
    const [
      totalUsers,
      activeUsers,
      usersByRole,
      usersByArea,
      totalBeneficiaries,
      activeBeneficiaries,
      totalAppointments,
      appointmentsByStatus
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { active: true } }),
      prisma.user.groupBy({ by: ['role'], _count: { _all: true }, orderBy: { role: 'asc' } }),
      prisma.user.groupBy({ by: ['area'], _count: { _all: true }, orderBy: { area: 'asc' } }),
      prisma.beneficiary.count(),
      prisma.beneficiary.count({ where: { active: true } }),
      prisma.appointment.count(),
      prisma.appointment.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } })
    ]);

    return {
      generatedAt: new Date().toISOString(),
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        byRole: usersByRole.map((item) => ({ label: item.role, count: item._count._all })),
        byArea: usersByArea.map((item) => ({ label: item.area || 'Sin área', count: item._count._all }))
      },
      beneficiaries: {
        total: totalBeneficiaries,
        active: activeBeneficiaries,
        inactive: totalBeneficiaries - activeBeneficiaries
      },
      appointments: {
        total: totalAppointments,
        byStatus: appointmentsByStatus.map((item) => ({ label: item.status, count: item._count._all }))
      }
    };
  });
}
