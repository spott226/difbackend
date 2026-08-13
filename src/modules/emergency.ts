import { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { hashEmergencyToken } from '../security/token.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const giganteBannerPaths = [
  path.resolve(moduleDir, '../../public/brand/gigante-incluyente-banner.png'),
  path.resolve(moduleDir, '../../../public/brand/gigante-incluyente-banner.png'),
  path.resolve(process.cwd(), 'public/brand/gigante-incluyente-banner.png'),
  path.resolve(process.cwd(), 'backend/public/brand/gigante-incluyente-banner.png')
];
let giganteBannerCache: Buffer | null = null;

async function giganteBannerImage() {
  if (giganteBannerCache) return giganteBannerCache;

  for (const imagePath of giganteBannerPaths) {
    try {
      giganteBannerCache = await fs.readFile(imagePath);
      return giganteBannerCache;
    } catch {
      // Se prueban las ubicaciones de desarrollo y compilación.
    }
  }

  throw new Error('No se encontró la imagen horizontal de El Gigante Incluyente');
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function field(label: string, value: unknown) {
  return `
    <div class="field">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || 'Sin registrar')}</strong>
    </div>
  `;
}

function formatAddress(address: any) {
  if (!address) return 'Sin registrar';

  const streetAndNumbers = [
    address.street,
    address.extNumber ? `Núm. ext. ${address.extNumber}` : '',
    address.intNumber ? `Núm. int. ${address.intNumber}` : ''
  ].filter(Boolean).join(' ');
  const neighborhood = address.neighborhood ? `Col. ${address.neighborhood}` : '';
  const postalCode = address.postalCode ? `C.P. ${address.postalCode}` : '';
  const parts = [
    streetAndNumbers,
    neighborhood,
    address.municipality,
    address.state,
    postalCode
  ].filter(Boolean);

  return parts.length ? parts.join(', ') : 'Sin registrar';
}

function pdfText(value: unknown) {
  return String(value ?? 'Sin registrar')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(value: unknown, max = 58) {
  const words = String(value ?? 'Sin registrar').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function jpegSize(buffer: Buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

async function jpegPhoto(photoPath: string | null) {
  if (!photoPath?.startsWith('/uploads/')) return null;
  try {
    const uploadRoot = path.resolve(process.cwd(), config.UPLOAD_DIR);
    const fileName = path.basename(photoPath);
    const absolutePath = path.resolve(path.join(uploadRoot, fileName));
    if (!absolutePath.startsWith(uploadRoot)) return null;
    const extension = path.extname(fileName).toLowerCase();
    if (!['.jpg', '.jpeg'].includes(extension)) return null;
    const data = await fs.readFile(absolutePath);
    const size = jpegSize(data);
    return size ? { data, ...size } : null;
  } catch {
    return null;
  }
}

function pdfLine(content: string[], text: unknown, x: number, y: number, size = 11, color = '0.05 0.09 0.36') {
  content.push(`${color} rg BT /F1 ${size} Tf ${x} ${y} Td (${pdfText(text)}) Tj ET`);
}

function pdfBox(content: string[], x: number, y: number, w: number, h: number, color = '1 1 1', stroke = '0.85 0.88 0.92') {
  content.push(`q ${color} rg ${stroke} RG 1 w ${x} ${y} ${w} ${h} re B Q`);
}

export async function emergencyPdf(beneficiary: any) {
  const name = `${beneficiary.firstName} ${beneficiary.paternalLastName} ${beneficiary.maternalLastName ?? ''}`.trim();
  const photo = await jpegPhoto(beneficiary.photoPath);
  const clinical = beneficiary.clinicalProfile;
  const disability = beneficiary.disabilityProfile;
  const contacts = beneficiary.emergencyContacts;
  const medicalService = clinical?.healthCoverage || clinical?.medicalService || clinical?.medicalServiceOther || 'Sin registrar';

  const content: string[] = [];
  content.push('q 0.95 0.99 1 rg 0 0 612 792 re f Q');
  content.push('q 0.16 0.08 0.55 rg 0 690 612 102 re f Q');
  content.push('q 0.83 0.08 0.53 rg 0 690 612 9 re f Q');
  content.push('q 0 0.68 0.94 rg 360 690 252 9 re f Q');
  pdfLine(content, 'DIF Estatal de Aguascalientes', 42, 744, 12, '1 1 1');
  pdfLine(content, 'El Gigante Incluyente', 42, 714, 22, '1 1 1');
  pdfLine(content, 'Nuestra tecnología es diferente', 380, 714, 12, '1 0.82 0');

  if (photo) {
    content.push('q 120 0 0 150 42 510 cm /Im1 Do Q');
  } else {
    pdfBox(content, 42, 510, 120, 150, '0.94 0.95 0.96');
    pdfLine(content, 'Sin foto', 78, 582, 13, '0.38 0.41 0.47');
  }
  pdfLine(content, 'Miembro DIF Estatal', 50, 492, 12, '0.16 0.08 0.55');

  pdfLine(content, name, 190, 626, 22, '0.16 0.08 0.55');
  pdfLine(content, `ID Soluciones: ${beneficiary.solucionesId}`, 190, 602, 12);
  pdfLine(content, `CURP: ${beneficiary.curp}`, 190, 584, 12);

  const fields = [
    ['Teléfono', beneficiary.phone],
    ['Domicilio', formatAddress(beneficiary.address)],
    ['Grupo sanguíneo', clinical?.bloodType],
    ['Discapacidad', disability?.disabilityType],
    ['Causa', disability?.cause],
    ['Grado / nivel funcional', disability?.functionalLevel],
    ['Diagnóstico médico', disability?.medicalDiagnosis],
    ['Medicamentos actuales', clinical?.medications],
    ['Enfermedades crónicas', clinical?.chronicDiseases],
    ['Alergias', clinical?.allergies || 'Ninguna conocida'],
    ['Emergencias', '911 | 089 | 072'],
    ['Servicio médico / derechohabiencia', medicalService]
  ];

  let y = 456;
  fields.forEach(([label, value], index) => {
    const x = index % 2 === 0 ? 42 : 318;
    if (index % 2 === 0 && index > 0) y -= 50;
    pdfBox(content, x, y, 252, 42);
    pdfLine(content, label, x + 12, y + 25, 8, '0.38 0.41 0.47');
    wrapText(value, 31).slice(0, 2).forEach((line, lineIndex) => pdfLine(content, line, x + 12, y + 12 - lineIndex * 10, 9));
  });

  y -= 62;
  pdfBox(content, 42, y, 528, 48, '1 0.98 0.86', '1 0.88 0.45');
  pdfLine(content, 'Indicaciones / observaciones médicas', 56, y + 29, 10, '0.16 0.08 0.55');
  wrapText(clinical?.emergencyNotes || 'Mantener la calma, verificar el estado de conciencia y contactar a familiares registrados.', 78)
    .forEach((line, index) => pdfLine(content, line, 56, y + 14 - index * 10, 9));

  y -= 104;
  pdfLine(content, 'Contactos de emergencia', 42, y + 92, 16, '0.83 0.08 0.53');
  (contacts.length ? contacts : [{ relationship: 'Contacto', name: 'Sin registrar', phone: '' }]).slice(0, 3).forEach((contact: any, index: number) => {
    const boxY = y + 52 - index * 34;
    pdfBox(content, 42, boxY, 528, 26);
    pdfLine(content, `${index + 1}. ${contact.relationship || 'Contacto'}: ${contact.name} ${contact.phone}`, 54, boxY + 9, 10);
  });

  pdfLine(content, 'Av. Convencion Sur esq. Mahatma Gandhi s/n, Col. Agricultura, Aguascalientes, Ags.', 42, 48, 10);
  pdfLine(content, 'www.aguascalientes.gob.mx/dif', 218, 28, 12, '0.38 0.41 0.47');

  const stream = Buffer.from(content.join('\n'), 'latin1');
  const objects: Buffer[] = [];
  const add = (value: Buffer | string) => {
    objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value, 'latin1'));
    return objects.length;
  };

  const imageObject = photo
    ? add(Buffer.concat([
        Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${photo.width} /Height ${photo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${photo.data.length} >>\nstream\n`, 'latin1'),
        photo.data,
        Buffer.from('\nendstream', 'latin1')
      ]))
    : null;
  const contentObject = add(Buffer.concat([
    Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'),
    stream,
    Buffer.from('\nendstream', 'latin1')
  ]));
  const fontObject = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const resources = imageObject
    ? `<< /Font << /F1 ${fontObject} 0 R >> /XObject << /Im1 ${imageObject} 0 R >> >>`
    : `<< /Font << /F1 ${fontObject} 0 R >> >>`;
  const pageObject = add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${contentObject} 0 R >>`);
  const pagesObject = add(`<< /Type /Pages /Kids [${pageObject} 0 R] /Count 1 >>`);
  const catalogObject = add(`<< /Type /Catalog /Pages ${pagesObject} 0 R >>`);
  objects[pageObject - 1] = Buffer.from(`<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${contentObject} 0 R >>`, 'latin1');

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`, 'latin1'), object, Buffer.from('\nendobj\n', 'latin1'));
  });
  const xrefOffset = Buffer.concat(chunks).length;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, 'latin1'));
  offsets.slice(1).forEach((offset) => chunks.push(Buffer.from(`${String(offset).padStart(10, '0')} 00000 n \n`, 'latin1')));
  chunks.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogObject} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, 'latin1'));
  return Buffer.concat(chunks);
}

export async function badgeDataPdf(beneficiary: any) {
  const name = `${beneficiary.firstName} ${beneficiary.paternalLastName} ${beneficiary.maternalLastName ?? ''}`.trim();
  const photo = await jpegPhoto(beneficiary.photoPath);
  const clinical = beneficiary.clinicalProfile;
  const disability = beneficiary.disabilityProfile;
  const contacts = beneficiary.emergencyContacts ?? [];
  const medicalService = clinical?.healthCoverage || clinical?.medicalService || clinical?.medicalServiceOther || 'Sin registrar';
  const contactPhones = contacts.length
    ? contacts.slice(0, 3).map((contact: any) => `${contact.name}: ${contact.phone}`).join(' | ')
    : 'Sin registrar';

  const content: string[] = [];
  content.push('q 0.96 0.99 1 rg 0 0 612 792 re f Q');
  content.push('q 0.16 0.08 0.55 rg 0 676 612 116 re f Q');
  content.push('q 0.83 0.08 0.53 rg 0 676 330 8 re f Q');
  content.push('q 0 0.68 0.94 rg 330 676 282 8 re f Q');
  pdfLine(content, 'DIF Estatal de Aguascalientes', 42, 748, 13, '1 1 1');
  pdfLine(content, 'Datos impresos en el gafete', 42, 714, 24, '1 1 1');

  if (photo) {
    const targetWidth = 140;
    const targetHeight = 175;
    const scale = Math.min(targetWidth / photo.width, targetHeight / photo.height);
    const drawWidth = photo.width * scale;
    const drawHeight = photo.height * scale;
    const drawX = 42 + (targetWidth - drawWidth) / 2;
    const drawY = 458 + (targetHeight - drawHeight) / 2;
    content.push(`q ${drawWidth} 0 0 ${drawHeight} ${drawX} ${drawY} cm /Im1 Do Q`);
  } else {
    pdfBox(content, 42, 458, 140, 175, '0.94 0.95 0.96');
    pdfLine(content, 'Sin foto', 84, 542, 13, '0.38 0.41 0.47');
  }

  pdfLine(content, name, 208, 600, 22, '0.16 0.08 0.55');
  pdfLine(content, 'El Gigante Incluyente', 208, 575, 12, '0.83 0.08 0.53');
  pdfLine(content, `ID Soluciones: ${beneficiary.solucionesId}`, 208, 540, 12);
  pdfLine(content, `Grupo sanguineo: ${clinical?.bloodType || 'Sin registrar'}`, 208, 516, 12);
  pdfLine(content, `Discapacidad: ${disability?.disabilityType || 'Sin registrar'}`, 208, 492, 12);

  const fields = [
    ['CURP', beneficiary.curp],
    ['Telefono', beneficiary.phone],
    ['Alergias', clinical?.allergies || 'Sin registrar'],
    ['Emergencias', '911 | 089 | 072'],
    ['Servicio medico', medicalService],
    ['Contactos de emergencia', contactPhones]
  ];
  let y = 414;
  fields.forEach(([label, value], index) => {
    const height = index === fields.length - 1 ? 62 : 48;
    pdfBox(content, 42, y, 528, height);
    pdfLine(content, label, 56, y + height - 18, 9, '0.83 0.08 0.53');
    wrapText(value, 82).slice(0, 3).forEach((line, lineIndex) => {
      pdfLine(content, line, 56, y + height - 34 - lineIndex * 11, 11);
    });
    y -= height + 10;
  });

  pdfLine(content, 'Este PDF contiene exclusivamente los datos visibles en el gafete.', 42, 30, 10, '0.38 0.41 0.47');

  const stream = Buffer.from(content.join('\n'), 'latin1');
  const objects: Buffer[] = [];
  const add = (value: Buffer | string) => {
    objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value, 'latin1'));
    return objects.length;
  };
  const imageObject = photo
    ? add(Buffer.concat([
        Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${photo.width} /Height ${photo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${photo.data.length} >>\nstream\n`, 'latin1'),
        photo.data,
        Buffer.from('\nendstream', 'latin1')
      ]))
    : null;
  const contentObject = add(Buffer.concat([
    Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'),
    stream,
    Buffer.from('\nendstream', 'latin1')
  ]));
  const fontObject = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const resources = imageObject
    ? `<< /Font << /F1 ${fontObject} 0 R >> /XObject << /Im1 ${imageObject} 0 R >> >>`
    : `<< /Font << /F1 ${fontObject} 0 R >> >>`;
  const pageObject = add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${contentObject} 0 R >>`);
  const pagesObject = add(`<< /Type /Pages /Kids [${pageObject} 0 R] /Count 1 >>`);
  const catalogObject = add(`<< /Type /Catalog /Pages ${pagesObject} 0 R >>`);
  objects[pageObject - 1] = Buffer.from(`<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${contentObject} 0 R >>`, 'latin1');

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`, 'latin1'), object, Buffer.from('\nendobj\n', 'latin1'));
  });
  const xrefOffset = Buffer.concat(chunks).length;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, 'latin1'));
  offsets.slice(1).forEach((offset) => chunks.push(Buffer.from(`${String(offset).padStart(10, '0')} 00000 n \n`, 'latin1')));
  chunks.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogObject} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, 'latin1'));
  return Buffer.concat(chunks);
}

function baseUrlFromRequest(request: { headers: Record<string, unknown>; protocol: string }) {
  const forwardedHost = request.headers['x-forwarded-host'];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || request.headers.host;
  const forwardedProto = request.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || request.protocol || 'http';
  return host ? `${proto}://${host}` : config.PUBLIC_BASE_URL.replace(/\/$/, '');
}

async function photoSource(request: { headers: Record<string, unknown>; protocol: string }, photoPath: string | null, embedPhoto: boolean) {
  if (!photoPath) return '';
  if (/^https?:\/\//i.test(photoPath)) return photoPath;

  if (embedPhoto && photoPath.startsWith('/uploads/')) {
    try {
      const uploadRoot = path.resolve(process.cwd(), config.UPLOAD_DIR);
      const fileName = path.basename(photoPath);
      const absolutePath = path.join(uploadRoot, fileName);
      const resolvedPath = path.resolve(absolutePath);
      if (resolvedPath.startsWith(uploadRoot)) {
        const buffer = await fs.readFile(resolvedPath);
        const extension = path.extname(fileName).toLowerCase();
        const mime = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
        return `data:${mime};base64,${buffer.toString('base64')}`;
      }
    } catch {
      // Si no se puede incrustar, se usa la URL absoluta como respaldo.
    }
  }

  return `${baseUrlFromRequest(request)}${photoPath}`;
}

export async function emergencyRoutes(app: FastifyInstance) {
  app.get('/public/assets/gigante-incluyente-banner.png', async (_request, reply) => {
    const image = await giganteBannerImage();
    return reply
      .header('cache-control', 'public, max-age=86400')
      .type('image/png')
      .send(image);
  });

  app.get('/public/emergency/:token/pdf', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(20) }).parse(request.params);
    const beneficiary = await prisma.beneficiary.findUnique({
      where: { emergencyTokenHash: hashEmergencyToken(token) },
      include: {
        address: true,
        emergencyContacts: { orderBy: { priority: 'asc' } },
        disabilityProfile: true,
        clinicalProfile: true,
        supports: true
      }
    });

    if (!beneficiary || !beneficiary.active) {
      return reply.code(404).send({ message: 'QR no encontrado o desactivado' });
    }

    const pdf = await emergencyPdf(beneficiary);
    const fileName = `qr-emergencia-${beneficiary.solucionesId}.pdf`;
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="${fileName}"`)
      .send(pdf);
  });

  app.get('/public/emergency/:token', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(20) }).parse(request.params);
    const beneficiary = await prisma.beneficiary.findUnique({
      where: { emergencyTokenHash: hashEmergencyToken(token) },
      include: {
        address: true,
        emergencyContacts: { orderBy: { priority: 'asc' } },
        disabilityProfile: true,
        clinicalProfile: true,
        supports: true
      }
    });

    if (!beneficiary || !beneficiary.active) {
      return reply.code(404).send({ message: 'QR no encontrado o desactivado' });
    }

    if ((request.query as { format?: string })?.format === 'json') {
      return {
        solucionesId: beneficiary.solucionesId,
        curp: beneficiary.curp,
        name: `${beneficiary.firstName} ${beneficiary.paternalLastName} ${beneficiary.maternalLastName ?? ''}`.trim(),
        phone: beneficiary.phone,
        photoPath: beneficiary.photoPath,
        address: beneficiary.address,
        disability: beneficiary.disabilityProfile,
        clinical: beneficiary.clinicalProfile,
        emergencyContacts: beneficiary.emergencyContacts,
        emergencyNumbers: ['911', '089 denuncia anonima', '072 atencion ciudadana'],
        supports: beneficiary.supports,
        updatedAt: beneficiary.updatedAt
      };
    }

    const name = `${beneficiary.firstName} ${beneficiary.paternalLastName} ${beneficiary.maternalLastName ?? ''}`.trim();
    const photoUrl = await photoSource(request, beneficiary.photoPath, true);
    const contacts = beneficiary.emergencyContacts.length
      ? beneficiary.emergencyContacts
          .map((contact, index) =>
            field(`Contacto de emergencia ${index + 1}`, `${contact.relationship || 'Contacto'}: ${contact.name} ${contact.phone}`)
          )
          .join('')
      : field('Contactos de emergencia', 'Sin registrar');
    const medicalService =
      beneficiary.clinicalProfile?.healthCoverage ||
      beneficiary.clinicalProfile?.medicalService ||
      beneficiary.clinicalProfile?.medicalServiceOther ||
      'Sin registrar';
    const giganteBannerUrl = `data:image/png;base64,${(await giganteBannerImage()).toString('base64')}`;

    return reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>El Gigante Incluyente - DIF Estatal</title>
  <style>
    :root { --brand:#d41487; --blue:#28158c; --cyan:#00aeef; --lime:#bed600; --yellow:#ffd200; --ink:#161b2f; --muted:#5f6878; --line:#dfe6ee; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--ink);
      background: linear-gradient(180deg, #eef9fb 0%, #ffffff 52%, #f7fbff 100%);
    }
    .page { width: min(100% - 28px, 980px); margin: 24px auto; }
    .actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 12px;
    }
    .actions button {
      border: 0;
      border-radius: 999px;
      padding: 11px 18px;
      color: white;
      background: linear-gradient(135deg, var(--blue), var(--brand));
      font-weight: 900;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(40, 21, 140, .20);
    }
    .actions button.secondary {
      color: var(--blue);
      background: white;
      border: 2px solid var(--blue);
      box-shadow: 0 8px 20px rgba(40, 21, 140, .12);
    }
    .actions button:disabled {
      cursor: wait;
      opacity: .65;
    }
    .export-status {
      flex-basis: 100%;
      min-height: 18px;
      color: #315b3d;
      font-size: 13px;
      font-weight: 700;
      text-align: right;
    }
    .export-status.error { color: #b42318; }
    .hero {
      border-radius: 18px;
      overflow: hidden;
      background: white;
      border: 1px solid var(--line);
      box-shadow: 0 18px 45px rgba(20, 30, 60, .10);
    }
    .top {
      min-height: 0;
      aspect-ratio: 3 / 1;
      padding: 0;
      background: #174b91;
      position: relative;
    }
    .top img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .content {
      display: grid;
      gap: 22px;
      padding: 24px;
    }
    .identity {
      display: grid;
      grid-template-columns: 170px 1fr;
      gap: 18px;
      align-items: center;
      padding: 16px;
      border-radius: 16px;
      background: linear-gradient(135deg, rgba(0,174,239,.10), rgba(212,20,135,.05));
      border: 1px solid #d8edf5;
    }
    .photo {
      aspect-ratio: 4 / 5;
      border-radius: 14px;
      border: 4px solid var(--brand);
      border-right-color: var(--cyan);
      border-bottom-color: var(--blue);
      background: #f1f4f7;
      display: grid;
      place-items: center;
      overflow: hidden;
      color: var(--muted);
      font-weight: 800;
    }
    .photo img { width: 100%; height: 100%; object-fit: cover; }
    .photo-caption {
      margin-top: 10px;
      text-align: center;
      color: var(--blue);
      font-weight: 900;
      font-size: 13px;
      text-transform: uppercase;
    }
    .name-card h2 { margin: 0 0 8px; color: var(--blue); font-size: clamp(24px, 4vw, 34px); line-height: 1; overflow-wrap: anywhere; }
    .name-card p { margin: 0; color: var(--muted); font-weight: 700; }
    .section-title { margin: 0 0 10px; color: var(--brand); text-transform: uppercase; letter-spacing: .04em; font-size: 15px; border-left: 8px solid var(--cyan); padding-left: 10px; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .wide-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .contacts-grid .field { border-left-color: var(--brand); background: linear-gradient(180deg, #fff, #fff7fb); }
    .field {
      min-height: 64px;
      border: 1px solid var(--line);
      border-top: 5px solid var(--cyan);
      border-radius: 10px;
      padding: 12px;
      background: #fff;
      overflow-wrap: anywhere;
    }
    .field:nth-child(3n+1) { border-top-color: var(--brand); }
    .field:nth-child(3n+2) { border-top-color: var(--lime); }
    .field.wide { min-height: 92px; }
    .field span { display: block; color: var(--muted); font-size: 12px; font-weight: 900; text-transform: uppercase; margin-bottom: 5px; }
    .field strong { color: var(--blue); font-size: 14px; line-height: 1.28; }
    .alert {
      padding: 14px 16px;
      border-radius: 14px;
      background: #fff8d8;
      border: 1px solid #ffe082;
      color: var(--blue);
      font-weight: 800;
    }
    .notes { display: grid; gap: 10px; }
    .footer {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 16px 20px;
      border-top: 1px solid var(--line);
      background: linear-gradient(90deg, rgba(212,20,135,.08), rgba(0,174,239,.08));
      color: var(--blue);
      font-weight: 800;
    }
    .tag { color: var(--brand); text-align: right; text-transform: uppercase; }
    @media (max-width: 760px) {
      .page { width: min(100% - 18px, 980px); margin: 10px auto; }
      .top {
        min-height: 0;
        aspect-ratio: 3 / 1;
        background-position: center;
      }
      .content { padding: 14px; }
      .identity { grid-template-columns: 1fr; }
      .photo { width: min(220px, 70vw); justify-self: center; }
      .grid, .wide-grid { grid-template-columns: 1fr; }
      .footer { grid-template-columns: 1fr; }
      .tag { text-align: left; }
    }
    @media print {
      @page { size: letter portrait; margin: .2in; }
      body {
        background: white;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page { width: 100%; margin: 0; }
      .actions { display: none; }
      .hero {
        box-shadow: none;
        border-radius: 10px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .top { min-height: 0; aspect-ratio: 3 / 1; }
      .content { gap: 13px; padding: 12px 14px; }
      .identity { grid-template-columns: 145px 1fr; gap: 12px; padding: 10px; }
      .photo-caption { font-size: 11px; margin-top: 6px; }
      .name-card h2 { font-size: 24px; margin-bottom: 4px; }
      .name-card p { margin-bottom: 8px; }
      .section-title { margin: 2px 0 5px; font-size: 12px; }
      .grid, .wide-grid { gap: 8px; }
      .field { min-height: 48px; padding: 7px 9px; border-radius: 8px; border-top-width: 4px; }
      .field.wide { min-height: 70px; }
      .field span { font-size: 9px; margin-bottom: 3px; }
      .field strong { font-size: 12px; line-height: 1.15; }
      .alert { margin-top: 8px; padding: 9px 10px; font-size: 12px; }
      .alert { background: #fff8d8 !important; }
      .footer { padding: 10px 14px; font-size: 10px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <div class="actions">
      <button id="printQrButton" type="button">Imprimir expediente QR</button>
      <button id="downloadQrPngButton" class="secondary" type="button">Descargar PNG</button>
      <button id="downloadQrPdfButton" class="secondary" type="button">Descargar PDF</button>
      <div id="exportStatus" class="export-status" role="status" aria-live="polite"></div>
    </div>
    <section
      id="qrExpediente"
      class="hero"
      data-file-name="expediente-qr-${escapeHtml(beneficiary.solucionesId)}"
    >
      <header class="top">
        <img src="${giganteBannerUrl}" alt="Gobierno del Estado de Aguascalientes. El Gigante Incluyente. DIF Estatal.">
      </header>
      <section class="content">
        <section class="identity">
          <aside>
            <div class="photo">${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="Foto de ${escapeHtml(name)}">` : 'Sin foto'}</div>
            <div class="photo-caption">Miembro DIF Estatal</div>
          </aside>
          <div class="name-card">
            <h2>${escapeHtml(name)}</h2>
            <p>ID Soluciones: ${escapeHtml(beneficiary.solucionesId)}</p>
            <p>CURP: ${escapeHtml(beneficiary.curp)}</p>
          </div>
        </section>

        <section>
          <h3 class="section-title">Datos críticos</h3>
          <div class="grid">
            ${field('Teléfono', beneficiary.phone)}
            ${field('Domicilio', formatAddress(beneficiary.address))}
            ${field('Grupo sanguíneo', beneficiary.clinicalProfile?.bloodType)}
            ${field('Discapacidad', beneficiary.disabilityProfile?.disabilityType)}
            ${field('Causa', beneficiary.disabilityProfile?.cause)}
            ${field('Grado / nivel funcional', beneficiary.disabilityProfile?.functionalLevel)}
            ${field('Alergias', beneficiary.clinicalProfile?.allergies || 'Ninguna conocida')}
            ${field('Emergencias', '911 | 089 | 072')}
            ${field('Servicio médico / derechohabiencia', medicalService)}
          </div>
        </section>

        <section>
          <h3 class="section-title">Diagnóstico y tratamiento</h3>
          <div class="wide-grid">
            <div class="field wide"><span>Diagnóstico médico específico</span><strong>${escapeHtml(beneficiary.disabilityProfile?.medicalDiagnosis || 'Sin registrar')}</strong></div>
            <div class="field wide"><span>Medicamentos actuales</span><strong>${escapeHtml(beneficiary.clinicalProfile?.medications || 'Sin registrar')}</strong></div>
            <div class="field wide"><span>Enfermedades crónicas</span><strong>${escapeHtml(beneficiary.clinicalProfile?.chronicDiseases || 'Sin registrar')}</strong></div>
            <div class="field wide"><span>Observaciones médicas</span><strong>${escapeHtml(beneficiary.disabilityProfile?.doctorNotes || 'Sin observaciones registradas')}</strong></div>
          </div>
        </section>

        <section class="notes">
          <div class="alert"><strong>Indicaciones:</strong> ${escapeHtml(beneficiary.clinicalProfile?.emergencyNotes || 'Mantener la calma, verificar el estado de conciencia y contactar a familiares registrados.')}</div>
        </section>

        <section>
          <h3 class="section-title">Contactos de emergencia</h3>
          <div class="grid contacts-grid">${contacts}</div>
        </section>
      </section>
      <footer class="footer">
        <div>Av. Convencion Sur esq. Mahatma Gandhi s/n, Col. Agricultura, Aguascalientes, Ags.</div>
        <div class="tag">Nuestra tecnología es diferente</div>
      </footer>
    </section>
  </main>
  <script src="/assets/vendor/html2canvas/html2canvas.min.js"></script>
  <script src="/assets/vendor/jspdf/jspdf.umd.min.js"></script>
  <script src="/assets/vendor/qr-export.js"></script>
</body>
</html>`);
  });
}
