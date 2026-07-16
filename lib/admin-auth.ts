import { createHmac, timingSafeEqual } from 'crypto';

export const ADMIN_SESSION_COOKIE = 'ime_admin_session';
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function getAdminSecret() {
  return process.env.ADMIN_ACCESS_PASSWORD || '';
}

export function createAdminSessionToken() {
  const secret = getAdminSecret();
  if (!secret) {
    throw new Error('ADMIN_ACCESS_PASSWORD is not configured');
  }

  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  const signature = createHmac('sha256', secret).update(String(expiresAt)).digest('hex');
  return `${expiresAt}.${signature}`;
}

export function verifyAdminSessionToken(token: string | undefined | null) {
  const secret = getAdminSecret();
  if (!secret || !token) return false;

  const [expiresAtText, signature] = token.split('.');
  if (!expiresAtText || !signature) return false;

  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expectedSignature = createHmac('sha256', secret).update(expiresAtText).digest('hex');
  if (signature.length !== expectedSignature.length) return false;

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}
