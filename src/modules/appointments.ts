import { FastifyInstance } from 'fastify';
import { AppointmentStatus } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAnyModule } from '../security/authorization.js';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSlot = z.string().regex(/^\d{2}:\d{2}$/);

const appointmentSchema = z.object({
  beneficiaryId: z.string().uuid(),
  serviceId: z.string().uuid(),
  doctorId: z.string().uuid(),
  appointmentDate: dateOnly,
  appointmentTime: timeSlot,
  room: z.string().trim().optional().nullable(),
  reason: z.string().trim().min(4),
  notes: z.string().trim().optional().nullable()
});

const appointmentQuerySchema = z.object({
  date: dateOnly.optional(),
  doctorId: z.string().uuid().optional(),
  beneficiaryId: z.string().uuid().optional(),
  status: z.nativeEnum(AppointmentStatus).optional()
});

const statusSchema = z.object({
  status: z.nativeEnum(AppointmentStatus),
  notes: z.string().trim().optional().nullable()
});

const appointmentInclude = {
  beneficiary: {
    select: {
      id: true,
      snsId: true,
      solucionesId: true,
      curp: true,
      firstName: true,
      paternalLastName: true,
      maternalLastName: true,
      phone: true
    }
  },
  service: true,
  doctor: true
};

function toUtcDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function cleanText(value: string | undefined | null) {
  const raw = (value ?? '').trim();
  if (!raw || raw.toUpperCase() === 'NULL') return null;
  if (!/[ÃÂ]/.test(raw)) return raw;
  try {
    return Buffer.from(raw, 'latin1').toString('utf8').trim() || raw;
  } catch {
    return raw;
  }
}

function legacyTimeSlots() {
  const files = [
    path.resolve(process.cwd(), '..', 'tools', 'legacy-catalogs', 'horarios-30min.tsv')
  ];
  const slots = new Set<string>();
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const row of fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) {
      const cols = row.split('\t');
      const time = cleanText(cols[2]);
      if (time && /^\d{1,2}:\d{2}$/.test(time)) {
        const [hour, minute] = time.split(':');
        slots.add(`${hour.padStart(2, '0')}:${minute}`);
      }
    }
  }
  return Array.from(slots).sort();
}

export async function appointmentRoutes(app: FastifyInstance) {
  app.get('/appointments/catalogs', { preHandler: [app.authenticate, requireAnyModule('agenda')] }, async () => {
    const [services, doctors] = await Promise.all([
      prisma.medicalService.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      prisma.medicalStaff.findMany({
        where: { active: true, assignsAppointments: true },
        orderBy: [{ specialty: 'asc' }, { displayName: 'asc' }]
      })
    ]);

    return {
      services,
      doctors,
      statuses: Object.values(AppointmentStatus),
      timeSlots: legacyTimeSlots()
    };
  });

  app.get('/appointments', { preHandler: [app.authenticate, requireAnyModule('agenda')] }, async (request) => {
    const query = appointmentQuerySchema.parse(request.query);
    return prisma.appointment.findMany({
      where: {
        appointmentDate: query.date ? toUtcDate(query.date) : undefined,
        doctorId: query.doctorId,
        beneficiaryId: query.beneficiaryId,
        status: query.status
      },
      orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
      include: appointmentInclude,
      take: 200
    });
  });

  app.post('/appointments', { preHandler: [app.authenticate, requireAnyModule('agenda')] }, async (request, reply) => {
    const input = appointmentSchema.parse(request.body);
    const appointmentDate = toUtcDate(input.appointmentDate);

    const [beneficiary, service, doctor] = await Promise.all([
      prisma.beneficiary.findUnique({ where: { id: input.beneficiaryId } }),
      prisma.medicalService.findUnique({ where: { id: input.serviceId } }),
      prisma.medicalStaff.findUnique({ where: { id: input.doctorId } })
    ]);

    if (!beneficiary) return reply.code(404).send({ message: 'Beneficiario no encontrado.' });
    if (!service?.active) return reply.code(400).send({ message: 'Servicio medico no disponible.' });
    if (!doctor?.active || !doctor.assignsAppointments) {
      return reply.code(400).send({ message: 'Medico no disponible para agenda.' });
    }

    const occupied = await prisma.appointment.findUnique({
      where: {
        doctorId_appointmentDate_appointmentTime: {
          doctorId: input.doctorId,
          appointmentDate,
          appointmentTime: input.appointmentTime
        }
      }
    });

    if (occupied && occupied.status !== AppointmentStatus.CANCELADA) {
      return reply.code(409).send({ message: 'Ese medico ya tiene una cita en esa fecha y horario.' });
    }

    const jwtUser = request.user as { sub?: string } | undefined;
    const createdByUserId = typeof jwtUser?.sub === 'string' ? jwtUser.sub : undefined;
    const appointment = await prisma.appointment.create({
      data: {
        beneficiaryId: input.beneficiaryId,
        serviceId: input.serviceId,
        doctorId: input.doctorId,
        createdByUserId,
        appointmentDate,
        appointmentTime: input.appointmentTime,
        room: input.room || doctor.room,
        reason: input.reason,
        notes: input.notes,
        status: AppointmentStatus.POR_PAGAR
      },
      include: appointmentInclude
    });

    return reply.code(201).send(appointment);
  });

  app.patch('/appointments/:id/status', { preHandler: [app.authenticate, requireAnyModule('agenda')] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = statusSchema.parse(request.body);

    const appointment = await prisma.appointment.findUnique({ where: { id: params.id } });
    if (!appointment) return reply.code(404).send({ message: 'Cita no encontrada.' });
    if ((appointment.status === AppointmentStatus.ATENDIDA || appointment.status === AppointmentStatus.FINALIZADA) && input.status !== appointment.status) {
      return reply.code(400).send({ message: 'La cita ya esta cerrada y no se puede reabrir desde agenda.' });
    }

    return prisma.appointment.update({
      where: { id: params.id },
      data: {
        status: input.status,
        notes: input.notes ?? appointment.notes
      },
      include: appointmentInclude
    });
  });
}
