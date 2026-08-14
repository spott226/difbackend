import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { requireAnyModule } from '../security/authorization.js';

const curpSchema = z.object({
  curp: z.string().trim().length(18).transform((value) => value.toUpperCase())
});

const stateMap: Record<string, string> = {
  AS: 'Aguascalientes',
  BC: 'Baja California',
  BS: 'Baja California Sur',
  CC: 'Campeche',
  CL: 'Coahuila',
  CM: 'Colima',
  CS: 'Chiapas',
  CH: 'Chihuahua',
  DF: 'Ciudad de Mexico',
  DG: 'Durango',
  GT: 'Guanajuato',
  GR: 'Guerrero',
  HG: 'Hidalgo',
  JC: 'Jalisco',
  MC: 'Estado de Mexico',
  MN: 'Michoacan',
  MS: 'Morelos',
  NT: 'Nayarit',
  NL: 'Nuevo Leon',
  OC: 'Oaxaca',
  PL: 'Puebla',
  QT: 'Queretaro',
  QR: 'Quintana Roo',
  SP: 'San Luis Potosi',
  SL: 'Sinaloa',
  SR: 'Sonora',
  TC: 'Tabasco',
  TS: 'Tamaulipas',
  TL: 'Tlaxcala',
  VZ: 'Veracruz',
  YN: 'Yucatan',
  ZS: 'Zacatecas',
  NE: 'Nacido en el extranjero'
};

function decodeCurp(curp: string) {
  const year = Number(curp.slice(4, 6));
  const month = curp.slice(6, 8);
  const day = curp.slice(8, 10);
  const century = year <= Number(String(new Date().getFullYear()).slice(2)) ? 2000 : 1900;
  const sex = curp[10] === 'H' ? 'MASCULINO' : curp[10] === 'M' ? 'FEMENINO' : 'NO_ESPECIFICADO';
  return {
    birthDate: `${century + year}-${month}-${day}`,
    sex,
    birthPlace: stateMap[curp.slice(11, 13)] ?? ''
  };
}

function pick(raw: string, names: string[]) {
  for (const name of names) {
    const match = raw.match(new RegExp(`<${name}[^>]*>([^<]*)<\\/${name}>`, 'i'));
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

export async function renapoRoutes(app: FastifyInstance) {
  app.get('/renapo/:curp', { preHandler: [app.authenticate, requireAnyModule('sindis')] }, async (request, reply) => {
    const { curp } = curpSchema.parse(request.params);
    const decoded = decodeCurp(curp);

    if (!config.RENAPO_URL || !config.RENAPO_TOKEN) {
      return reply.code(200).send({
        curp,
        source: 'local-fallback',
        ...decoded,
        message: 'RENAPO no esta configurado. Se llenaron datos derivados del CURP.'
      });
    }

    const url = new URL(config.RENAPO_URL);
    url.searchParams.set('CURP', curp);
    url.searchParams.set('token', config.RENAPO_TOKEN);

    const response = await fetch(url);
    if (!response.ok) {
      return reply.code(502).send({ message: 'RENAPO no respondio correctamente' });
    }

    const text = await response.text();
    return {
      curp,
      source: 'renapo',
      ...decoded,
      firstName: pick(text, ['nombres', 'Nombre', 'NOMBRE']),
      paternalLastName: pick(text, ['apellido1', 'primerApellido', 'APELLIDO1', 'AP_PAT']),
      maternalLastName: pick(text, ['apellido2', 'segundoApellido', 'APELLIDO2', 'AP_MAT']),
      raw: text
    };
  });
}
