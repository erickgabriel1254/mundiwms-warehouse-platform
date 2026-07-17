import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from './prisma.js';

const SESSION_SECRET = process.env.SESSION_SECRET || 'local-mundiwms-secret';

export function hashPassword(password: string) {
  const salt = 'mundiwms';
  const hash = createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(':');
  const actual = createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function sign(payload: string) {
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

export function createToken(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, iat: Date.now() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export async function getUserFromToken(token?: string) {
  if (!token) return null;
  const [payload, signature] = token.replace('Bearer ', '').split('.');
  if (!payload || !signature || signature !== sign(payload)) return null;

  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { userId: string };
  return prisma.user.findFirst({
    where: { id: parsed.userId, isActive: true },
    include: { role: true },
  });
}
