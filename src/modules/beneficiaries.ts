import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import QRCode from 'qrcode';
import os from 'node:os';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { createEmergencyToken, hashEmergencyToken } from '../security/token.js';
import { badgeDataPdf } from './emergency.js';
import { createXlsx, XlsxColumn } from '../export/xlsx.js';
import { readFirstWorksheet } from '../export/xlsx-reader.js';

const emptyToNull = (value: unknown) => value === '' ? null : value;
const optionalText = z.preprocess(emptyToNull, z.string().optional().nullable());
const optionalEmail = z.preprocess(emptyToNull, z.string().email().optional().nullable());
const optionalDate = z.preprocess(emptyToNull, z.string().date().optional().nullable());
const jsonNumber = z.union([z.number().nonnegative(), z.null()]).optional();

const contactSchema = z.object({
  name: z.string().min(2),
  relationship: z.string().optional().default('Sin especificar'),
  phone: z.string().min(7),
  priority: z.number().int().min(1).max(5).default(1)
});

const beneficiarySchema = z.object({
  solucionesId: z.string().min(3),
  curp: z.string().length(18).transform((value) => value.toUpperCase()),
  firstName: z.string().min(2),
  paternalLastName: z.string().min(2),
  maternalLastName: optionalText,
  birthDate: z.string().date(),
  sex: z.enum(['FEMENINO', 'MASCULINO', 'NO_ESPECIFICADO']),
  occupation: optionalText,
  birthPlace: optionalText,
  email: optionalEmail,
  maritalStatus: optionalText,
  educationLevel: optionalText,
  phone: optionalText,
  works: z.boolean().default(false),
  headOfFamily: z.boolean().default(false),
  address: z.object({
    state: z.string().default('Aguascalientes'),
    municipality: z.string().min(2),
    locality: z.string().min(2),
    neighborhood: optionalText,
    postalCode: optionalText,
    street: z.string().optional().default('Sin especificar'),
    extNumber: optionalText,
    intNumber: optionalText,
    housingType: optionalText,
    zoneType: z.enum(['URBANA', 'RURAL', 'INDIGENA', 'SIN_ESPECIFICAR']).default('SIN_ESPECIFICAR')
  }),
  emergencyContacts: z.array(contactSchema).max(5).default([]),
  disabilityProfile: z.object({
    disabilityType: z.string().min(2),
    medicalDiagnosis: z.string().optional().default('Sin especificar'),
    cause: optionalText,
    doctorNotes: optionalText,
    functionalLevel: optionalText
  }),
  clinicalProfile: z.object({
    bloodType: optionalText,
    healthCoverage: optionalText,
    medicalService: optionalText,
    medicalServiceOther: optionalText,
    allergies: optionalText,
    medications: optionalText,
    chronicDiseases: optionalText,
    emergencyNotes: optionalText
  }).optional(),
  socioeconomicStudy: z.object({
    householdIncome: z.number().nonnegative().optional().nullable(),
    dependents: z.number().int().nonnegative().optional().nullable(),
    housingStatus: optionalText,
    services: optionalText,
    familyType: optionalText,
    incomeType: optionalText,
    rentAmount: z.number().nonnegative().optional().nullable(),
    yearsInHome: z.number().int().nonnegative().optional().nullable(),
    bedrooms: z.number().int().nonnegative().optional().nullable(),
    bathrooms: z.number().int().nonnegative().optional().nullable(),
    floors: z.number().int().nonnegative().optional().nullable(),
    roofMaterial: optionalText,
    floorMaterial: optionalText,
    wallMaterial: optionalText,
    hygiene: optionalText,
    movableAssets: z.array(z.string()).optional().default([]),
    basicServices: z.array(z.string()).optional().default([]),
    incomeDetails: z.record(jsonNumber).optional().default({}),
    expenseDetails: z.record(jsonNumber).optional().default({}),
    familyMembers: z.array(z.object({
      name: optionalText,
      relationship: optionalText,
      birthDate: optionalText,
      sex: optionalText,
      educationLevel: optionalText,
      maritalStatus: optionalText,
      occupation: optionalText
    })).optional().default([]),
    foodFrequency: z.record(z.string()).optional().default({}),
    healthDiagnosis: optionalText,
    motivation: optionalText,
    difReason: optionalText,
    institution: optionalText,
    resolutionDate: optionalDate,
    officeDate: optionalDate,
    finalDiagnosis: optionalText,
    summary: optionalText
  }).optional(),
  psychologyNote: optionalText,
  kardexNote: optionalText,
  supports: z.array(z.object({
    name: z.string().min(2),
    institution: optionalText,
    notes: optionalText
  })).default([])
});

function normalizeStudy(input: z.infer<typeof beneficiarySchema>['socioeconomicStudy']) {
  if (!input) return undefined;
  return {
    ...input,
    resolutionDate: input.resolutionDate ? new Date(input.resolutionDate) : null,
    officeDate: input.officeDate ? new Date(input.officeDate) : null
  };
}

const beneficiaryInclude = {
  address: true,
  emergencyContacts: { orderBy: { priority: 'asc' as const } },
  disabilityProfile: true,
  clinicalProfile: true,
  socioeconomicStudy: true,
  psychologyNotes: { orderBy: { createdAt: 'desc' as const } },
  kardexEntries: { orderBy: { createdAt: 'desc' as const } },
  supports: true
};

const importHeaders = [
  'ID Soluciones',
  'CURP',
  'Nombre(s)',
  'Apellido paterno',
  'Apellido materno',
  'Fecha de nacimiento',
  'Sexo',
  'Teléfono personal',
  'Estado',
  'Municipio',
  'Localidad',
  'Colonia',
  'Código postal',
  'Calle',
  'Número exterior',
  'Número interior',
  'Tipo de zona',
  'Tipo de discapacidad',
  'Diagnóstico médico',
  'Causa de discapacidad',
  'Nivel funcional',
  'Grupo sanguíneo',
  'Servicio médico',
  'Alergias',
  'Medicamentos actuales',
  'Enfermedades crónicas',
  'Indicaciones de emergencia',
  'Contacto 1 nombre',
  'Contacto 1 parentesco',
  'Contacto 1 teléfono',
  'Contacto 2 nombre',
  'Contacto 2 parentesco',
  'Contacto 2 teléfono',
  'Contacto 3 nombre',
  'Contacto 3 parentesco',
  'Contacto 3 teléfono'
];

const importHeaderAliases: Record<string, string[]> = {
  'Teléfono personal': ['Teléfono'],
  Estado: ['Estado domicilio'],
  'Causa de discapacidad': ['Causa'],
  'Medicamentos actuales': ['Medicamentos']
};

function excelDate(value: string) {
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const milliseconds = (Number(trimmed) - 25569) * 86400000;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : trimmed;
}

function clean(value: string | undefined) {
  return value?.trim() || '';
}

function nextSnsId(count: number) {
  return `SNS-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
}

function isLocalHost(hostname: string) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function isPrivateHost(hostname: string) {
  return (
    isLocalHost(hostname) ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function forwardedBaseUrl(request: FastifyRequest) {
  const forwardedHost = request.headers['x-forwarded-host'];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || request.headers.host;
  if (!host) return null;

  const protoHeader = request.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || request.protocol || 'http';
  const base = new URL(`${proto}://${host}`);
  return base;
}

function publicBaseUrl(request: FastifyRequest) {
  const configured = new URL(config.PUBLIC_BASE_URL);
  const forwarded = forwardedBaseUrl(request);
  if (forwarded && !isLocalHost(forwarded.hostname)) {
    return forwarded.toString().replace(/\/$/, '');
  }

  const activeAddresses = Object.values(os.networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) =>
      address.family === 'IPv4' &&
      !address.internal &&
      !address.address.startsWith('169.254.')
    )
    .map((address) => address.address);

  if (activeAddresses.includes(configured.hostname)) {
    return configured.toString().replace(/\/$/, '');
  }

  if (isPrivateHost(configured.hostname)) {
    const configuredSubnet = configured.hostname.split('.').slice(0, 3).join('.');
    const sameSubnetAddress = activeAddresses.find((address) =>
      address.split('.').slice(0, 3).join('.') === configuredSubnet
    );
    if (sameSubnetAddress) {
      configured.hostname = sameSubnetAddress;
      return configured.toString().replace(/\/$/, '');
    }
  } else if (!isLocalHost(configured.hostname)) {
    return configured.toString().replace(/\/$/, '');
  }

  const privateAddress = activeAddresses.find((address) => isPrivateHost(address));
  if (privateAddress) {
    configured.hostname = privateAddress;
    return configured.toString().replace(/\/$/, '');
  }

  return configured.toString().replace(/\/$/, '');
}

function qrNetworkWarning(emergencyUrl: string) {
  void emergencyUrl;
  return null;
}

export async function beneficiaryRoutes(app: FastifyInstance) {
  app.get('/beneficiaries', { preHandler: [app.authenticate] }, async (request) => {
    const q = z.object({ search: z.string().optional() }).parse(request.query).search;
    return prisma.beneficiary.findMany({
      where: {
        active: true,
        ...(q
          ? {
              OR: [
                { curp: { contains: q.toUpperCase() } },
                { snsId: { contains: q.toUpperCase() } },
                { solucionesId: { contains: q } },
                { firstName: { contains: q, mode: 'insensitive' } },
                { paternalLastName: { contains: q, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      include: { disabilityProfile: true, clinicalProfile: true, emergencyContacts: { orderBy: { priority: 'asc' } } }
    });
  });

  app.get('/beneficiaries/export/xlsx', { preHandler: [app.authenticate] }, async (_request, reply) => {
    const beneficiaries = await prisma.beneficiary.findMany({
      orderBy: [{ active: 'desc' }, { paternalLastName: 'asc' }, { firstName: 'asc' }],
      include: beneficiaryInclude
    });
    const columns: XlsxColumn[] = [
      { header: 'Estado', width: 12 },
      { header: 'SNS', width: 20 },
      { header: 'ID Soluciones', width: 22 },
      { header: 'CURP', width: 22 },
      { header: 'Nombre(s)', width: 22 },
      { header: 'Apellido paterno', width: 20 },
      { header: 'Apellido materno', width: 20 },
      { header: 'Fecha de nacimiento', width: 18 },
      { header: 'Sexo', width: 18 },
      { header: 'Teléfono', width: 18 },
      { header: 'Correo electrónico', width: 28 },
      { header: 'Ocupación', width: 22 },
      { header: 'Lugar de nacimiento', width: 22 },
      { header: 'Estado civil', width: 18 },
      { header: 'Escolaridad', width: 20 },
      { header: 'Trabaja', width: 12 },
      { header: 'Jefe(a) de familia', width: 16 },
      { header: 'Estado domicilio', width: 20 },
      { header: 'Municipio', width: 20 },
      { header: 'Localidad', width: 20 },
      { header: 'Colonia', width: 24 },
      { header: 'Código postal', width: 16 },
      { header: 'Calle', width: 26 },
      { header: 'Número exterior', width: 16 },
      { header: 'Número interior', width: 16 },
      { header: 'Tipo de zona', width: 18 },
      { header: 'Tipo de discapacidad', width: 24 },
      { header: 'Diagnóstico médico', width: 34 },
      { header: 'Causa', width: 24 },
      { header: 'Nivel funcional', width: 22 },
      { header: 'Notas médicas', width: 34 },
      { header: 'Grupo sanguíneo', width: 18 },
      { header: 'Servicio médico', width: 22 },
      { header: 'Alergias', width: 28 },
      { header: 'Medicamentos', width: 30 },
      { header: 'Enfermedades crónicas', width: 30 },
      { header: 'Indicaciones de emergencia', width: 38 },
      { header: 'Contacto 1 nombre', width: 24 },
      { header: 'Contacto 1 parentesco', width: 20 },
      { header: 'Contacto 1 teléfono', width: 18 },
      { header: 'Contacto 2 nombre', width: 24 },
      { header: 'Contacto 2 parentesco', width: 20 },
      { header: 'Contacto 2 teléfono', width: 18 },
      { header: 'Contacto 3 nombre', width: 24 },
      { header: 'Contacto 3 parentesco', width: 20 },
      { header: 'Contacto 3 teléfono', width: 18 },
      { header: 'Ingreso familiar mensual', width: 22 },
      { header: 'Dependientes', width: 14 },
      { header: 'Resumen socioeconómico', width: 38 },
      { header: 'Apoyos', width: 34 },
      { header: 'Fecha de alta', width: 18 },
      { header: 'Última actualización', width: 20 }
    ];
    const rows = beneficiaries.map((beneficiary) => {
      const contacts = beneficiary.emergencyContacts;
      const address = beneficiary.address;
      const disability = beneficiary.disabilityProfile;
      const clinical = beneficiary.clinicalProfile;
      const study = beneficiary.socioeconomicStudy;
      return [
        beneficiary.active ? 'ACTIVO' : 'ELIMINADO',
        beneficiary.snsId,
        beneficiary.solucionesId,
        beneficiary.curp,
        beneficiary.firstName,
        beneficiary.paternalLastName,
        beneficiary.maternalLastName,
        beneficiary.birthDate,
        beneficiary.sex,
        beneficiary.phone,
        beneficiary.email,
        beneficiary.occupation,
        beneficiary.birthPlace,
        beneficiary.maritalStatus,
        beneficiary.educationLevel,
        beneficiary.works,
        beneficiary.headOfFamily,
        address?.state,
        address?.municipality,
        address?.locality,
        address?.neighborhood,
        address?.postalCode,
        address?.street,
        address?.extNumber,
        address?.intNumber,
        address?.zoneType,
        disability?.disabilityType,
        disability?.medicalDiagnosis,
        disability?.cause,
        disability?.functionalLevel,
        disability?.doctorNotes,
        clinical?.bloodType,
        clinical?.healthCoverage || clinical?.medicalService || clinical?.medicalServiceOther,
        clinical?.allergies,
        clinical?.medications,
        clinical?.chronicDiseases,
        clinical?.emergencyNotes,
        contacts[0]?.name,
        contacts[0]?.relationship,
        contacts[0]?.phone,
        contacts[1]?.name,
        contacts[1]?.relationship,
        contacts[1]?.phone,
        contacts[2]?.name,
        contacts[2]?.relationship,
        contacts[2]?.phone,
        study?.householdIncome ? Number(study.householdIncome) : null,
        study?.dependents,
        study?.summary,
        beneficiary.supports.map((support) => [support.name, support.institution, support.notes].filter(Boolean).join(' - ')).join(' | '),
        beneficiary.createdAt,
        beneficiary.updatedAt
      ];
    });
    const workbook = createXlsx(columns, rows, 'Beneficiarios');
    const date = new Date().toISOString().slice(0, 10);
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="beneficiarios-${date}.xlsx"`)
      .send(workbook);
  });

  app.get('/beneficiaries/import/template', { preHandler: [app.authenticate] }, async (_request, reply) => {
    const columns = importHeaders.map((header) => ({ header, width: header.length > 22 ? 30 : 20 }));
    const template = createXlsx(columns, [], 'Captura');
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', 'attachment; filename="Plantilla_captura_beneficiarios.xlsx"')
      .send(template);
  });

  app.post('/beneficiaries/import/xlsx', { preHandler: [app.authenticate] }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ message: 'Seleccione un archivo Excel' });
    if (!file.filename.toLowerCase().endsWith('.xlsx')) {
      return reply.code(400).send({ message: 'La importación requiere un archivo .xlsx' });
    }

    let sheetRows: string[][];
    try {
      sheetRows = readFirstWorksheet(await file.toBuffer());
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'No se pudo leer el Excel' });
    }

    const headers = (sheetRows[0] ?? []).map(clean);
    const headerIndexes = new Map(
      importHeaders.map((header) => {
        const acceptedHeaders = [header, ...(importHeaderAliases[header] ?? [])];
        return [header, headers.findIndex((candidate) => acceptedHeaders.includes(candidate))] as const;
      })
    );
    const validHeaders = importHeaders.every((header) => (headerIndexes.get(header) ?? -1) >= 0);
    if (!validHeaders) {
      return reply.code(400).send({
        message: 'Faltan columnas requeridas. Use la plantilla de captura o un archivo exportado por El Gigante Incluyente sin cambiar los encabezados.'
      });
    }

    let created = 0;
    let updated = 0;
    const errors: Array<{ row: number; message: string }> = [];
    const dataRows = sheetRows.slice(1).filter((row) => row.some((value) => clean(value)));

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
      const row = dataRows[rowIndex];
      const value = (header: string) => clean(row[headerIndexes.get(header) ?? -1]);
      const contacts = [1, 2, 3]
        .map((priority) => ({
          name: value(`Contacto ${priority} nombre`),
          relationship: value(`Contacto ${priority} parentesco`) || 'Sin especificar',
          phone: value(`Contacto ${priority} teléfono`),
          priority
        }))
        .filter((contact) => contact.name || contact.phone);

      try {
        const input = beneficiarySchema.parse({
          solucionesId: value('ID Soluciones'),
          curp: value('CURP'),
          firstName: value('Nombre(s)'),
          paternalLastName: value('Apellido paterno'),
          maternalLastName: value('Apellido materno'),
          birthDate: excelDate(value('Fecha de nacimiento')),
          sex: value('Sexo').toUpperCase(),
          phone: value('Teléfono personal'),
          works: false,
          headOfFamily: false,
          address: {
            state: value('Estado') || 'Aguascalientes',
            municipality: value('Municipio'),
            locality: value('Localidad'),
            neighborhood: value('Colonia'),
            postalCode: value('Código postal'),
            street: value('Calle'),
            extNumber: value('Número exterior'),
            intNumber: value('Número interior'),
            zoneType: value('Tipo de zona').toUpperCase() || 'SIN_ESPECIFICAR'
          },
          emergencyContacts: contacts,
          disabilityProfile: {
            disabilityType: value('Tipo de discapacidad'),
            medicalDiagnosis: value('Diagnóstico médico') || 'Sin especificar',
            cause: value('Causa de discapacidad'),
            functionalLevel: value('Nivel funcional')
          },
          clinicalProfile: {
            bloodType: value('Grupo sanguíneo'),
            healthCoverage: value('Servicio médico'),
            medicalService: value('Servicio médico'),
            allergies: value('Alergias'),
            medications: value('Medicamentos actuales'),
            chronicDiseases: value('Enfermedades crónicas'),
            emergencyNotes: value('Indicaciones de emergencia')
          },
          supports: []
        });
        const existing = await prisma.beneficiary.findUnique({ where: { curp: input.curp } });

        if (existing) {
          await prisma.beneficiary.update({
            where: { id: existing.id },
            data: {
              solucionesId: input.solucionesId,
              firstName: input.firstName,
              paternalLastName: input.paternalLastName,
              maternalLastName: input.maternalLastName,
              birthDate: new Date(input.birthDate),
              sex: input.sex,
              phone: input.phone,
              active: true,
              address: { upsert: { create: input.address, update: input.address } },
              emergencyContacts: { deleteMany: {}, create: input.emergencyContacts },
              disabilityProfile: { upsert: { create: input.disabilityProfile, update: input.disabilityProfile } },
              clinicalProfile: input.clinicalProfile
                ? { upsert: { create: input.clinicalProfile, update: input.clinicalProfile } }
                : undefined
            }
          });
          updated += 1;
        } else {
          const emergencyToken = createEmergencyToken();
          const count = await prisma.beneficiary.count();
          await prisma.beneficiary.create({
            data: {
              snsId: nextSnsId(count),
              solucionesId: input.solucionesId,
              curp: input.curp,
              firstName: input.firstName,
              paternalLastName: input.paternalLastName,
              maternalLastName: input.maternalLastName,
              birthDate: new Date(input.birthDate),
              sex: input.sex,
              phone: input.phone,
              emergencyTokenHash: hashEmergencyToken(emergencyToken),
              emergencyTokenLast4: emergencyToken.slice(-4),
              address: { create: input.address },
              emergencyContacts: { create: input.emergencyContacts },
              disabilityProfile: { create: input.disabilityProfile },
              clinicalProfile: input.clinicalProfile ? { create: input.clinicalProfile } : undefined
            }
          });
          created += 1;
        }
      } catch (error) {
        const message = error instanceof z.ZodError
          ? Object.entries(error.flatten().fieldErrors)
              .flatMap(([field, messages]) => (messages ?? []).map((item) => `${field}: ${item}`))
              .join(' | ')
          : error instanceof Error ? error.message : 'Error desconocido';
        errors.push({ row: rowIndex + 2, message });
      }
    }

    return {
      totalRows: dataRows.length,
      created,
      updated,
      errors
    };
  });

  app.post('/beneficiaries', { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = beneficiarySchema.parse(request.body);
    const emergencyToken = createEmergencyToken();
    const count = await prisma.beneficiary.count();

    const beneficiary = await prisma.beneficiary.create({
      data: {
        snsId: nextSnsId(count),
        solucionesId: input.solucionesId,
        curp: input.curp,
        firstName: input.firstName,
        paternalLastName: input.paternalLastName,
        maternalLastName: input.maternalLastName,
        birthDate: new Date(input.birthDate),
        sex: input.sex,
        occupation: input.occupation,
        birthPlace: input.birthPlace,
        email: input.email,
        maritalStatus: input.maritalStatus,
        educationLevel: input.educationLevel,
        phone: input.phone,
        works: input.works,
        headOfFamily: input.headOfFamily,
        emergencyTokenHash: hashEmergencyToken(emergencyToken),
        emergencyTokenLast4: emergencyToken.slice(-4),
        address: { create: input.address },
        emergencyContacts: { create: input.emergencyContacts },
        disabilityProfile: { create: input.disabilityProfile },
        clinicalProfile: input.clinicalProfile ? { create: input.clinicalProfile } : undefined,
        socioeconomicStudy: input.socioeconomicStudy ? { create: normalizeStudy(input.socioeconomicStudy) } : undefined,
        psychologyNotes: input.psychologyNote ? { create: { note: input.psychologyNote } } : undefined,
        kardexEntries: input.kardexNote ? { create: { title: 'Alta inicial', detail: input.kardexNote } } : undefined,
        supports: { create: input.supports }
      },
      include: beneficiaryInclude
    });

    const emergencyUrl = `${publicBaseUrl(request)}/public/emergency/${emergencyToken}`;
    const qrDataUrl = await QRCode.toDataURL(emergencyUrl, { margin: 1, width: 320 });

    return reply.code(201).send({ beneficiary, emergencyUrl, qrDataUrl, qrWarning: qrNetworkWarning(emergencyUrl) });
  });

  app.get('/beneficiaries/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const beneficiary = await prisma.beneficiary.findUnique({
      where: { id },
      include: beneficiaryInclude
    });

    if (!beneficiary) return reply.code(404).send({ message: 'Beneficiario no encontrado' });
    return beneficiary;
  });

  app.get('/beneficiaries/:id/pdf', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const beneficiary = await prisma.beneficiary.findUnique({
      where: { id },
      include: beneficiaryInclude
    });

    if (!beneficiary) return reply.code(404).send({ message: 'Beneficiario no encontrado' });
    const pdf = await badgeDataPdf(beneficiary);
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="datos-gafete-${beneficiary.solucionesId}.pdf"`)
      .send(pdf);
  });

  app.put('/beneficiaries/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = beneficiarySchema.parse(request.body);
    const studyData = normalizeStudy(input.socioeconomicStudy);

    const beneficiary = await prisma.beneficiary.update({
      where: { id },
      data: {
        solucionesId: input.solucionesId,
        curp: input.curp,
        firstName: input.firstName,
        paternalLastName: input.paternalLastName,
        maternalLastName: input.maternalLastName,
        birthDate: new Date(input.birthDate),
        sex: input.sex,
        occupation: input.occupation,
        birthPlace: input.birthPlace,
        email: input.email,
        maritalStatus: input.maritalStatus,
        educationLevel: input.educationLevel,
        phone: input.phone,
        works: input.works,
        headOfFamily: input.headOfFamily,
        address: { upsert: { create: input.address, update: input.address } },
        emergencyContacts: { deleteMany: {}, create: input.emergencyContacts },
        disabilityProfile: { upsert: { create: input.disabilityProfile, update: input.disabilityProfile } },
        clinicalProfile: input.clinicalProfile
          ? { upsert: { create: input.clinicalProfile, update: input.clinicalProfile } }
          : undefined,
        socioeconomicStudy: studyData
          ? { upsert: { create: studyData, update: studyData } }
          : undefined,
        psychologyNotes: {
          deleteMany: {},
          ...(input.psychologyNote ? { create: { note: input.psychologyNote } } : {})
        },
        kardexEntries: {
          deleteMany: {},
          ...(input.kardexNote ? { create: { title: 'Actualizacion', detail: input.kardexNote } } : {})
        },
        supports: { deleteMany: {}, create: input.supports }
      },
      include: beneficiaryInclude
    });

    return { beneficiary };
  });

  app.delete('/beneficiaries/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const beneficiary = await prisma.beneficiary.findUnique({ where: { id } });

    if (!beneficiary || !beneficiary.active) {
      return reply.code(404).send({ message: 'Beneficiario no encontrado' });
    }

    await prisma.beneficiary.update({
      where: { id },
      data: { active: false }
    });

    return { ok: true };
  });

  app.post('/beneficiaries/:id/emergency-token', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const emergencyToken = createEmergencyToken();
    await prisma.beneficiary.update({
      where: { id },
      data: {
        emergencyTokenHash: hashEmergencyToken(emergencyToken),
        emergencyTokenLast4: emergencyToken.slice(-4)
      }
    });

    const emergencyUrl = `${publicBaseUrl(request)}/public/emergency/${emergencyToken}`;
    const qrDataUrl = await QRCode.toDataURL(emergencyUrl, { margin: 1, width: 320 });
    return reply.send({ emergencyUrl, qrDataUrl, qrWarning: qrNetworkWarning(emergencyUrl) });
  });
}
