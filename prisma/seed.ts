import 'dotenv/config';
import { PrismaClient, Role, ZoneType } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from '../src/security/password.js';

const prisma = new PrismaClient();

const municipalities: Array<[string, string[]]> = [
  ['Aguascalientes', ['Aguascalientes', 'Peñuelas', 'Calvillito', 'Los Arellano']],
  ['Asientos', ['Asientos', 'Villa Juarez', 'Ciénega Grande']],
  ['Calvillo', ['Calvillo', 'Ojocaliente', 'Malpaso']],
  ['Cosío', ['Cosío', 'Soledad de Arriba']],
  ['El Llano', ['Palo Alto', 'El Retoño']],
  ['Jesús María', ['Jesús María', 'Maravillas', 'Valladolid']],
  ['Pabellón de Arteaga', ['Pabellón de Arteaga', 'Emiliano Zapata']],
  ['Rincón de Romos', ['Rincón de Romos', 'Pabellón de Hidalgo']],
  ['San Francisco de los Romo', ['San Francisco de los Romo', 'La Escondida']],
  ['San José de Gracia', ['San José de Gracia', 'Boca de Túnel']],
  ['Tepezalá', ['Tepezalá', 'San Antonio']]
];

const legacyCatalogDir = path.resolve(process.cwd(), '..', 'tools', 'legacy-catalogs');

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

function numberOrNull(value: string | undefined | null) {
  const clean = cleanText(value);
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolFromLegacy(value: string | undefined | null, fallback = true) {
  const clean = cleanText(value);
  if (clean === null) return fallback;
  return ['1', 'TRUE', 'A', 'ACTIVO'].includes(clean.toUpperCase());
}

function decimalOrNull(value: string | undefined | null) {
  const clean = cleanText(value)?.replace(',', '.');
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function readTsv(fileName: string) {
  const file = path.join(legacyCatalogDir, fileName);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((row) => row.split('\t'));
}

async function main() {
  await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {},
    create: {
      username: 'superadmin',
      displayName: 'Administrador Servicios Medicos DIF Estatal',
      passwordHash: await hashPassword('Cambiar123!'),
      role: Role.SUPER_ADMIN
    }
  });

  for (const [rawName, rawLocalities] of municipalities) {
    const name = cleanText(rawName) || rawName;
    const localities = rawLocalities.map((locality) => cleanText(locality) || locality);

    const municipality = await prisma.catalogMunicipality.upsert({
      where: { name },
      update: {},
      create: { name }
    });

    for (const localityName of localities) {
      await prisma.catalogLocality.upsert({
        where: { municipalityId_name: { municipalityId: municipality.id, name: localityName } },
        update: {},
        create: {
          municipalityId: municipality.id,
          name: localityName,
          zoneType: localityName === name ? ZoneType.URBANA : ZoneType.RURAL
        }
      });
    }
  }

  const previousProgramService = await prisma.medicalService.findFirst({
    where: { name: { in: ['SINDIS', 'Programa Integral de Discapacidad'] } }
  });
  if (previousProgramService) {
    const currentProgramService = await prisma.medicalService.findUnique({
      where: { name: 'El Gigante Incluyente' }
    });

    if (currentProgramService) {
      await prisma.$transaction([
        prisma.appointment.updateMany({
          where: { serviceId: previousProgramService.id },
          data: { serviceId: currentProgramService.id }
        }),
        prisma.medicalService.delete({ where: { id: previousProgramService.id } })
      ]);
    } else {
      await prisma.medicalService.update({
        where: { id: previousProgramService.id },
        data: {
          name: 'El Gigante Incluyente',
          description: 'Identificacion, inclusion social, QR y gafete.',
          active: true
        }
      });
    }
  }

  const serviceRows = readTsv('servicios-medicos.tsv');
  if (serviceRows.length) {
    for (const row of serviceRows) {
      const legacyId = numberOrNull(row[1]);
      const importedName = cleanText(row[2]);
      const name = importedName === 'SINDIS' || importedName === 'Programa Integral de Discapacidad'
        ? 'El Gigante Incluyente'
        : importedName;
      if (!legacyId || !name) continue;

      await prisma.medicalService.upsert({
        where: { legacyId },
        update: {
          name,
          description: `Servicio legacy ckSerMed ${legacyId}`,
          specialtyLegacyId: numberOrNull(row[11]),
          prices: {
            cuota1: numberOrNull(row[3]),
            cuota2: numberOrNull(row[4]),
            cuota3: numberOrNull(row[5]),
            cuota4: numberOrNull(row[6]),
            cuota5: numberOrNull(row[7]),
            cuota6: numberOrNull(row[8]),
            grupo: numberOrNull(row[10])
          },
          active: true
        },
        create: {
          legacyId,
          name,
          description: `Servicio legacy ckSerMed ${legacyId}`,
          specialtyLegacyId: numberOrNull(row[11]),
          prices: {
            cuota1: numberOrNull(row[3]),
            cuota2: numberOrNull(row[4]),
            cuota3: numberOrNull(row[5]),
            cuota4: numberOrNull(row[6]),
            cuota5: numberOrNull(row[7]),
            cuota6: numberOrNull(row[8]),
            grupo: numberOrNull(row[10])
          }
        }
      });
    }
  } else {
    for (const [name, description] of [
      ['Consulta medica general', 'Atencion medica inicial y seguimiento clinico.'],
      ['Medicina de rehabilitacion', 'Valoracion y seguimiento de rehabilitacion.'],
      ['Terapia fisica', 'Sesiones de terapia fisica y funcional.'],
      ['Psicologia', 'Atencion psicologica y valoracion emocional.'],
      ['Trabajo social', 'Valoracion social, estudio socioeconomico y apoyos.'],
      ['El Gigante Incluyente', 'Identificacion, inclusion social, QR y gafete.']
    ] as const) {
      await prisma.medicalService.upsert({
        where: { name },
        update: { description, active: true },
        create: { name, description }
      });
    }
  }

  const staffRows = readTsv('personal-medico.tsv');
  if (staffRows.length) {
    for (const row of staffRows) {
      const legacyStaffId = numberOrNull(row[1]);
      const displayName = cleanText(row[3]);
      if (!legacyStaffId || !displayName) continue;

      await prisma.medicalStaff.upsert({
        where: { legacyStaffId },
        update: {
          legacyUserId: numberOrNull(row[2]),
          username: cleanText(row[4]),
          displayName,
          position: cleanText(row[5]),
          professionalId: cleanText(row[8]),
          specialtyLegacyId: numberOrNull(row[9]),
          specialty: cleanText(row[10]) || 'Sin especificar',
          secondarySpecialtyLegacyId: numberOrNull(row[11]),
          secondarySpecialty: cleanText(row[12]),
          room: cleanText(row[13]),
          shiftLegacyId: numberOrNull(row[14]),
          shift: cleanText(row[15]),
          active: boolFromLegacy(row[21]),
          assignsAppointments: boolFromLegacy(row[20])
        },
        create: {
          legacyStaffId,
          legacyUserId: numberOrNull(row[2]),
          username: cleanText(row[4]),
          displayName,
          position: cleanText(row[5]),
          professionalId: cleanText(row[8]),
          specialtyLegacyId: numberOrNull(row[9]),
          specialty: cleanText(row[10]) || 'Sin especificar',
          secondarySpecialtyLegacyId: numberOrNull(row[11]),
          secondarySpecialty: cleanText(row[12]),
          room: cleanText(row[13]),
          shiftLegacyId: numberOrNull(row[14]),
          shift: cleanText(row[15]),
          active: boolFromLegacy(row[21]),
          assignsAppointments: boolFromLegacy(row[20])
        }
      });
    }
  }

  const medicationRows = readTsv('medicamentos.tsv');
  for (const row of medicationRows) {
    const legacyId = numberOrNull(row[1]);
    const name = cleanText(row[2]);
    if (!legacyId || !name) continue;

    await prisma.medicationCatalog.upsert({
      where: { legacyId },
      update: {
        name,
        presentation: cleanText(row[3]),
        active: boolFromLegacy(row[4])
      },
      create: {
        legacyId,
        name,
        presentation: cleanText(row[3]),
        active: boolFromLegacy(row[4])
      }
    });
  }

  const cashRows = readTsv('caja-articulos.tsv');
  for (const row of cashRows) {
    const legacyPriceId = numberOrNull(row[1]);
    const name = cleanText(row[3]);
    if (!legacyPriceId || !name) continue;

    await prisma.cashItem.upsert({
      where: { legacyPriceId },
      update: {
        legacyArticleId: numberOrNull(row[2]),
        name,
        category: cleanText(row[4]),
        price: decimalOrNull(row[5]),
        unitPrice: decimalOrNull(row[6]),
        source: cleanText(row[9]),
        specialtyLegacyId: numberOrNull(row[15]),
        active: boolFromLegacy(row[14])
      },
      create: {
        legacyPriceId,
        legacyArticleId: numberOrNull(row[2]),
        name,
        category: cleanText(row[4]),
        price: decimalOrNull(row[5]),
        unitPrice: decimalOrNull(row[6]),
        source: cleanText(row[9]),
        specialtyLegacyId: numberOrNull(row[15]),
        active: boolFromLegacy(row[14])
      }
    });
  }
}

main()
  .finally(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
