import { prisma } from '../src/db.js';
import { createEmergencyToken, hashEmergencyToken } from '../src/security/token.js';

type PatientRow = {
  firstName: string;
  paternalLastName: string;
  maternalLastName: string;
  solucionesId: string;
  bloodType: string;
  disabilityType: string;
  street: string;
  extNumber: string;
  intNumber: string;
  neighborhood: string;
  municipality: string;
  state: string;
  postalCode: string;
  curp: string;
  phone: string;
  allergies: string;
  medicalService: string;
  emergencyContacts: Array<{ name: string; phone: string; priority: number }>;
  notes: string;
};

const patients: PatientRow[] = [
  {
    firstName: 'Olga Imelda',
    paternalLastName: 'Montoya',
    maternalLastName: 'Murillo',
    solucionesId: '0007500',
    bloodType: 'O+',
    disabilityType: 'Neuromotora',
    street: 'Salvador Melchor',
    extNumber: '110',
    intNumber: '',
    neighborhood: 'J. Guadalupe Peralta Gamez',
    municipality: 'Aguascalientes',
    state: 'Aguascalientes',
    postalCode: '20196',
    curp: 'MOMO770815MASNRL00',
    phone: '4492625895',
    allergies: 'A medicamentos: Penicilina',
    medicalService: 'IMSS',
    emergencyContacts: [
      { name: 'Ricardo de Jesús Gómez Montoya', phone: '4492607078', priority: 1 },
      { name: 'Ricardo Gómez Ruiz', phone: '4494333053', priority: 2 },
      { name: 'Patricio Montoya Santana', phone: '4491297604', priority: 3 }
    ],
    notes: `Diagnóstico: Discapacidad neuromotora. Osteogénesis Imperfecta.

Primeros auxilios
Manipúlela con extremo cuidado. Evite jalarla de brazos o piernas o realizar movimientos bruscos, ya que existe alto riesgo de fracturas. Si presenta una caída, dolor intenso o deformidad, evite movilizarla innecesariamente y solicite atención médica de inmediato.

Información para personal médico
Paciente con Osteogénesis Imperfecta y discapacidad neuromotora. Alto riesgo de fracturas por fragilidad ósea. Realizar movilización con técnicas de mínima manipulación. Valorar lesiones osteomusculares posteriores a cualquier traumatismo y considerar antecedentes de fracturas previas y deformidades óseas durante la exploración clínica.`
  },
  {
    firstName: 'Victor Hugo',
    paternalLastName: 'Delgado',
    maternalLastName: 'Gallegos',
    solucionesId: 'Pendiente de su registro el lunes porque no trae su INE',
    bloodType: 'A+',
    disabilityType: 'Neuromotora',
    street: 'Río Sena',
    extNumber: '125',
    intNumber: '',
    neighborhood: 'Colinas del Río',
    municipality: 'Aguascalientes',
    state: 'Aguascalientes',
    postalCode: '20010',
    curp: 'DEGV591130HASLLC07',
    phone: '4492600322',
    allergies: 'Alergías negadas',
    medicalService: 'IMSS',
    emergencyContacts: [
      { name: 'Ma. Guadalupe Gallegos Soto', phone: '4498052305', priority: 1 },
      { name: 'Victor Hugo Delgado Gallegos', phone: '4491257664', priority: 2 },
      { name: 'Carolina Delgado Gallegos', phone: '4491937909', priority: 3 }
    ],
    notes: `Diagnóstico: Discapacidad neuromotora. Secuelas de Síndrome de Guillain-Barré.

Primeros auxilios
Ayúdele únicamente si es necesario. Evite movimientos bruscos o levantarlo sin apoyo adecuado. Si presenta dificultad para respirar, pérdida del conocimiento o sufrió una caída, solicite atención médica inmediata. Durante el traslado procure mantener su cuerpo alineado y en una posición cómoda.

Información para personal médico
Paciente con secuelas neuromotoras por Síndrome de Guillain-Barré. Puede presentar debilidad muscular residual y limitación importante para la movilidad. Valorar función respiratoria, fuerza muscular y estado neurológico. Extremar precauciones durante la movilización y transferencia para evitar lesiones secundarias.`
  }
];

function birthDateFromCurp(curp: string) {
  const yy = Number(curp.slice(4, 6));
  const mm = curp.slice(6, 8);
  const dd = curp.slice(8, 10);
  const currentYY = Number(String(new Date().getFullYear()).slice(2));
  const century = yy > currentYY ? 1900 : 2000;
  return new Date(`${century + yy}-${mm}-${dd}T00:00:00.000Z`);
}

function sexFromCurp(curp: string) {
  return curp[10] === 'H' ? 'MASCULINO' : curp[10] === 'M' ? 'FEMENINO' : 'NO_ESPECIFICADO';
}

async function nextSnsId() {
  const count = await prisma.beneficiary.count();
  return `SNS-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
}

async function upsertPatient(row: PatientRow) {
  const existing = await prisma.beneficiary.findUnique({
    where: { curp: row.curp },
    include: {
      address: true,
      emergencyContacts: true,
      disabilityProfile: true,
      clinicalProfile: true,
      socioeconomicStudy: true
    }
  });

  const token = createEmergencyToken();
  const baseData = {
    solucionesId: row.solucionesId,
    firstName: row.firstName,
    paternalLastName: row.paternalLastName,
    maternalLastName: row.maternalLastName,
    birthDate: birthDateFromCurp(row.curp),
    sex: sexFromCurp(row.curp) as 'FEMENINO' | 'MASCULINO' | 'NO_ESPECIFICADO',
    birthPlace: 'Aguascalientes',
    phone: row.phone,
    active: true,
    emergencyTokenHash: hashEmergencyToken(token),
    emergencyTokenLast4: token.slice(-4)
  };
  const address = {
    state: row.state,
    municipality: row.municipality,
    locality: row.municipality,
    neighborhood: row.neighborhood,
    postalCode: row.postalCode,
    street: row.street,
    extNumber: row.extNumber,
    intNumber: row.intNumber || null,
    zoneType: 'URBANA' as const
  };
  const disabilityProfile = {
    disabilityType: row.disabilityType,
    medicalDiagnosis: row.notes.split('\n')[0].replace(/^Diagnóstico:\s*/i, ''),
    cause: 'Sin especificar',
    doctorNotes: row.notes,
    functionalLevel: 'Sin especificar'
  };
  const clinicalProfile = {
    bloodType: row.bloodType,
    healthCoverage: row.medicalService,
    medicalService: row.medicalService,
    allergies: row.allergies,
    emergencyNotes: row.notes
  };

  if (existing) {
    await prisma.beneficiary.update({
      where: { id: existing.id },
      data: {
        ...baseData,
        address: { upsert: { create: address, update: address } },
        emergencyContacts: {
          deleteMany: {},
          create: row.emergencyContacts.map((contact) => ({
            ...contact,
            relationship: 'Contacto de emergencia'
          }))
        },
        disabilityProfile: { upsert: { create: disabilityProfile, update: disabilityProfile } },
        clinicalProfile: { upsert: { create: clinicalProfile, update: clinicalProfile } },
        socioeconomicStudy: {
          upsert: {
            create: { summary: row.notes },
            update: { summary: row.notes }
          }
        }
      }
    });
    return { action: 'updated', name: `${row.firstName} ${row.paternalLastName}` };
  }

  await prisma.beneficiary.create({
    data: {
      ...baseData,
      snsId: await nextSnsId(),
      curp: row.curp,
      address: { create: address },
      emergencyContacts: {
        create: row.emergencyContacts.map((contact) => ({
          ...contact,
          relationship: 'Contacto de emergencia'
        }))
      },
      disabilityProfile: { create: disabilityProfile },
      clinicalProfile: { create: clinicalProfile },
      socioeconomicStudy: { create: { summary: row.notes } },
      kardexEntries: { create: { title: 'Alta inicial', detail: row.notes } }
    }
  });
  return { action: 'created', name: `${row.firstName} ${row.paternalLastName}` };
}

for (const patient of patients) {
  const result = await upsertPatient(patient);
  console.log(`${result.action}: ${result.name}`);
}

await prisma.$disconnect();
