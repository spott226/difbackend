import { inflateRawSync } from 'node:zlib';

function xmlDecode(value: string) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function zipEntries(buffer: Buffer) {
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error('El archivo no es un XLSX válido');

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let centralOffset = buffer.readUInt32LE(endOffset + 16);
  const entries = new Map<string, Buffer>();
  let totalUncompressedSize = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error('Estructura XLSX dañada');
    const method = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const uncompressedSize = buffer.readUInt32LE(centralOffset + 24);
    const nameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localOffset = buffer.readUInt32LE(centralOffset + 42);
    const name = buffer.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString('utf8');
    totalUncompressedSize += uncompressedSize;
    if (totalUncompressedSize > 64 * 1024 * 1024) {
      throw new Error('El archivo Excel es demasiado grande para importarse');
    }

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Entrada XLSX dañada');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
    if (data) entries.set(name.replaceAll('\\', '/'), data);

    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function textNodes(xml: string) {
  return [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)]
    .map((match) => xmlDecode(match[1]))
    .join('');
}

function columnIndex(reference: string) {
  const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? 'A';
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
}

export function readFirstWorksheet(buffer: Buffer) {
  const entries = zipEntries(buffer);
  const sharedXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  const sharedStrings = [...sharedXml.matchAll(/<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g)]
    .map((match) => textNodes(match[1]));
  const sheetEntry = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort()[0];
  if (!sheetEntry) throw new Error('El archivo no contiene una hoja de cálculo');

  const sheetXml = entries.get(sheetEntry)!.toString('utf8');
  const rows: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<(?:\w+:)?row(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const row: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<(?:\w+:)?c\s([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>|<(?:\w+:)?c\s([^>]*)\/>/g)) {
      const attributes = cellMatch[1] || cellMatch[3] || '';
      const body = cellMatch[2] || '';
      const reference = attributes.match(/\br="([^"]+)"/)?.[1] ?? 'A1';
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? '';
      const raw = body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1] ?? '';
      let value = '';
      if (type === 's') value = sharedStrings[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = textNodes(body);
      else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
      else value = xmlDecode(raw);
      row[columnIndex(reference)] = value;
    }
    rows.push(row);
  }
  return rows;
}
