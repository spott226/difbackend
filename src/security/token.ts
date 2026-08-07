import crypto from 'node:crypto';

export function createEmergencyToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashEmergencyToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
