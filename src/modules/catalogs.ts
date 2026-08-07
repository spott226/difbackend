import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/catalogs/municipalities', { preHandler: [app.authenticate] }, async () => {
    return prisma.catalogMunicipality.findMany({
      orderBy: { name: 'asc' },
      include: { localities: { orderBy: { name: 'asc' } } }
    });
  });

  app.get('/catalogs/disability-types', { preHandler: [app.authenticate] }, async () => {
    return {
      types: [
        'NEUROMOTORA',
        'VISUAL',
        'AUDITIVA',
        'INTELECTUAL',
        'PSICOSOCIAL',
        'LENGUAJE',
        'MULTIPLE',
        'OTRA'
      ],
      causes: [
        'CONGENITA',
        'ENFERMEDAD',
        'ACCIDENTE',
        'EDAD AVANZADA',
        'VIOLENCIA',
        'COMPLICACION MEDICA',
        'SIN ESPECIFICAR'
      ],
      grades: ['LEVE', 'MODERADA', 'SEVERA', 'PROFUNDA', 'SIN ESPECIFICAR']
    };
  });

  app.get('/catalogs/medical-services', { preHandler: [app.authenticate] }, async () => {
    return {
      coverage: [
        'Sin especificar',
        'IMSS',
        'Seguro Popular',
        'ISSSTE',
        'PEMEX',
        'Particular',
        'ISEA',
        'Consultorios Similares',
        'Ninguno',
        'CRIS',
        'Militar'
      ],
      freeServices: [
        'ISSEA - Centro de Salud',
        'ISSEA - Hospital General',
        'Hospital Miguel Hidalgo',
        'DIF Estatal - Centro de Rehabilitacion e Integracion Social',
        'DIF Municipal - Unidad Basica de Rehabilitacion',
        'Cruz Roja Mexicana - urgencias',
        'Sin servicio medico'
      ]
    };
  });

  app.get('/catalogs/medications', { preHandler: [app.authenticate] }, async () => {
    return prisma.medicationCatalog.findMany({
      where: { active: true },
      orderBy: [{ name: 'asc' }, { presentation: 'asc' }],
      take: 500
    });
  });

  app.get('/catalogs/cash-items', { preHandler: [app.authenticate] }, async () => {
    return prisma.cashItem.findMany({
      where: { active: true },
      orderBy: [{ name: 'asc' }],
      take: 500
    });
  });

  app.get('/catalogs/neighborhoods', { preHandler: [app.authenticate] }, async () => {
    return {
      Aguascalientes: [
        'Centro',
        'Casa Blanca',
        'Morelos',
        'Insurgentes',
        'Ojocaliente',
        'Pilar Blanco',
        'Mujeres Ilustres',
        'Villas de Nuestra Senora de la Asuncion',
        'Pocitos',
        'Trojes de Alonso'
      ],
      'Jesus Maria': ['Centro', 'Maravillas', 'Villas de Guadalupe', 'Margaritas'],
      Calvillo: ['Centro', 'Los Angeles', 'Ojocaliente', 'Malpaso'],
      Asientos: ['Centro', 'Villa Juarez', 'Cienega Grande'],
      Cosio: ['Centro', 'Soledad de Arriba'],
      'Rincon de Romos': ['Centro', 'Pabellon de Hidalgo'],
      Tepezala: ['Centro', 'San Antonio'],
      'San Jose de Gracia': ['Centro', 'Boca de Tunel'],
      'El Llano': ['Palo Alto', 'El Retono'],
      'Pabellon de Arteaga': ['Centro', 'Emiliano Zapata'],
      'San Francisco de los Romo': ['Centro', 'La Escondida']
    };
  });
}
