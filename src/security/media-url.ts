import crypto from 'node:crypto';
import { config } from '../config.js';

const mediaKey = crypto.createHash('sha256').update(`media:${config.JWT_SECRET}`).digest();
const signedUrlLifetimeSeconds = 60 * 60;

function signature(pathname: string, expires: number) {
  return crypto.createHmac('sha256', mediaKey).update(`${pathname}:${expires}`).digest('base64url');
}

export function signPhotoPath(photoPath: string | null | undefined) {
  if (!photoPath?.startsWith('/uploads/')) return photoPath ?? null;
  const pathname = new URL(photoPath, 'http://local').pathname;
  const expires = Math.floor(Date.now() / 1000) + signedUrlLifetimeSeconds;
  const query = new URLSearchParams({ expires: String(expires), signature: signature(pathname, expires) });
  return `${pathname}?${query}`;
}

export function verifySignedPhotoUrl(requestUrl: string, now = Math.floor(Date.now() / 1000)) {
  const url = new URL(requestUrl, 'http://local');
  if (!url.pathname.startsWith('/uploads/')) return false;
  const expires = Number(url.searchParams.get('expires'));
  const provided = url.searchParams.get('signature');
  if (!Number.isSafeInteger(expires) || expires < now || expires > now + signedUrlLifetimeSeconds + 60 || !provided) return false;
  const expected = signature(url.pathname, expires);
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}
