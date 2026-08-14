import { Role } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';

export function requireAnyModule(...moduleIds: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.authUser;
    if (!user) {
      return reply.code(401).send({ message: 'La cuenta ya no está activa' });
    }
    if (user.role === Role.SUPER_ADMIN || moduleIds.some((moduleId) => user.modules.includes(moduleId))) {
      return;
    }
    return reply.code(403).send({ message: 'No tienes permiso para usar este módulo' });
  };
}
