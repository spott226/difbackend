import { prisma } from '../src/db.js';

const rows = await prisma.beneficiary.findMany({
  where: { curp: { in: ['MOMO770815MASNRL00', 'DEGV591130HASLLC07'] } },
  select: {
    firstName: true,
    paternalLastName: true,
    curp: true,
    solucionesId: true,
    active: true,
    address: { select: { street: true, extNumber: true, neighborhood: true, postalCode: true } },
    emergencyContacts: { select: { name: true, phone: true }, orderBy: { priority: 'asc' } }
  },
  orderBy: { firstName: 'asc' }
});

console.log(JSON.stringify(rows, null, 2));

await prisma.$disconnect();
