import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { readFirstWorksheet } from '../src/export/xlsx-reader.js';

function zip(entries: Array<{ name: string; data: Buffer; declaredSize?: number }>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const compressed = deflateRawSync(entry.data);
    const declaredSize = entry.declaredSize ?? entry.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(declaredSize, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(declaredSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

test('reads a legitimate bounded worksheet', () => {
  const workbook = zip([{
    name: 'xl/worksheets/sheet1.xml',
    data: Buffer.from('<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Nombre</t></is></c></row></sheetData></worksheet>')
  }]);
  assert.deepEqual(readFirstWorksheet(workbook), [['Nombre']]);
});

test('rejects compressed data whose real output exceeds declared size', () => {
  const workbook = zip([{
    name: 'xl/worksheets/sheet1.xml',
    data: Buffer.alloc(1024 * 1024, 65),
    declaredSize: 16
  }]);
  assert.throws(() => readFirstWorksheet(workbook), /datos comprimidos inválidos/);
});

test('signed photograph links expire and reject tampering', async () => {
  process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET ||= 'test-only-secret-with-more-than-32-characters';
  const { signPhotoPath, verifySignedPhotoUrl } = await import('../src/security/media-url.js');
  const signed = signPhotoPath('/uploads/example.jpg');
  assert.ok(signed && verifySignedPhotoUrl(signed));
  assert.equal(verifySignedPhotoUrl(signed!.replace('example.jpg', 'other.jpg')), false);
  const expires = Number(new URL(signed!, 'http://local').searchParams.get('expires'));
  assert.equal(verifySignedPhotoUrl(signed!, expires + 1), false);
});
