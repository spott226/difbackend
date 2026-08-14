import { Role } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';

export function requireAnyModule(...moduleIds: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = String((request.user as { sub?: string }).sub || '');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { active: true, role: true, modules: true }
    });

    if (!user?.active) {
      return reply.code(401).send({ message: 'La cuenta ya no está activa' });
    }
    if (user.role === Role.SUPER_ADMIN || moduleIds.some((moduleId) => user.modules.includes(moduleId))) {
      return;
    }
    return reply.code(403).send({ message: 'No tienes permiso para usar este módulo' });
  };
}
