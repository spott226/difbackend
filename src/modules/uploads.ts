import { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAnyModule } from '../security/authorization.js';
import { signPhotoPath } from '../security/media-url.js';

const paramsSchema = z.object({ id: z.string().uuid() });
const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function uploadRoutes(app: FastifyInstance) {
  app.post('/beneficiaries/:id/photo', { preHandler: [app.authenticate, requireAnyModule('sindis')] }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const file = await request.file();

    if (!file) return reply.code(400).send({ message: 'Archivo requerido' });
    if (!allowedMime.has(file.mimetype)) {
      return reply.code(400).send({ message: 'Solo se aceptan imagenes JPG, PNG o WEBP' });
    }

    const extension = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const uploadRoot = path.resolve(process.cwd(), config.UPLOAD_DIR);
    await fs.mkdir(uploadRoot, { recursive: true });

    const relativePath = `${id}-${Date.now()}.${extension}`;
    const absolutePath = path.join(uploadRoot, relativePath);
    await fs.writeFile(absolutePath, await file.toBuffer());

    const beneficiary = await prisma.beneficiary.update({
      where: { id },
      data: { photoPath: `/uploads/${relativePath}` }
    });

    return { photoPath: signPhotoPath(beneficiary.photoPath) };
  });

  app.post('/beneficiaries/:id/signature', { preHandler: [app.authenticate, requireAnyModule('sindis')] }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const file = await request.file();

    if (!file) return reply.code(400).send({ message: 'Archivo requerido' });
    if (!allowedMime.has(file.mimetype)) {
      return reply.code(400).send({ message: 'Solo se aceptan firmas JPG, PNG o WEBP' });
    }

    const buffer = await file.toBuffer();
    if (buffer.length > 2 * 1024 * 1024) {
      return reply.code(400).send({ message: 'La firma no debe superar 2 MB' });
    }

    const signatureData = `data:${file.mimetype};base64,${buffer.toString('base64')}`;
    await prisma.beneficiary.update({
      where: { id },
      data: { signatureData } as any
    });

    return { signatureData };
  });
}
