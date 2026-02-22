import crypto from 'node:crypto';
import type { AuthUser, TelegramAuthPayload } from './types.js';

const telegramAuthMaxAgeSeconds = 24 * 60 * 60;
const tokenLifetimeSeconds = 30 * 24 * 60 * 60;
const jwtHeader = { alg: 'HS256', typ: 'JWT' };

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(`${normalized}${'='.repeat(padLength)}`, 'base64').toString('utf8');
}

function signHmac(data: string, secret: string): Buffer {
  return crypto.createHmac('sha256', secret).update(data).digest();
}

function safeStringCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getTelegramDataCheckString(payload: TelegramAuthPayload): string {
  const fields: Record<string, string> = {
    id: payload.id,
    auth_date: String(payload.auth_date),
    first_name: payload.first_name
  };

  if (payload.last_name) {
    fields.last_name = payload.last_name;
  }
  if (payload.username) {
    fields.username = payload.username;
  }
  if (payload.photo_url) {
    fields.photo_url = payload.photo_url;
  }

  return Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export function verifyTelegramAuthPayload(payload: TelegramAuthPayload, botToken: string): AuthUser | null {
  const now = Math.floor(Date.now() / 1000);
  if (payload.auth_date > now + 60 || now - payload.auth_date > telegramAuthMaxAgeSeconds) {
    return null;
  }

  const dataCheckString = getTelegramDataCheckString(payload);
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!safeStringCompare(computedHash, payload.hash.toLowerCase())) {
    return null;
  }

  return {
    id: payload.id,
    firstName: payload.first_name,
    lastName: payload.last_name,
    username: payload.username,
    photoUrl: payload.photo_url,
    authDate: payload.auth_date
  };
}

export function issueAuthToken(user: AuthUser, secret: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + tokenLifetimeSeconds;

  const payload = {
    sub: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    photoUrl: user.photoUrl,
    authDate: user.authDate,
    iat,
    exp
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(jwtHeader));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = base64UrlEncode(signHmac(data, secret));

  return `${data}.${signature}`;
}

export function verifyAuthToken(token: string, secret: string): AuthUser | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = base64UrlEncode(signHmac(data, secret));

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const decodedHeader = JSON.parse(base64UrlDecode(encodedHeader)) as { alg?: string; typ?: string };
    if (decodedHeader.alg !== 'HS256' || decodedHeader.typ !== 'JWT') {
      return null;
    }

    const decodedPayload = JSON.parse(base64UrlDecode(encodedPayload)) as {
      sub?: string;
      firstName?: string;
      lastName?: string;
      username?: string;
      photoUrl?: string;
      authDate?: number;
      exp?: number;
    };

    if (typeof decodedPayload.sub !== 'string' || typeof decodedPayload.firstName !== 'string') {
      return null;
    }

    if (typeof decodedPayload.exp !== 'number' || decodedPayload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      id: decodedPayload.sub,
      firstName: decodedPayload.firstName,
      lastName: decodedPayload.lastName,
      username: decodedPayload.username,
      photoUrl: decodedPayload.photoUrl,
      authDate: typeof decodedPayload.authDate === 'number' ? decodedPayload.authDate : 0
    };
  } catch {
    return null;
  }
}

export function parseBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) {
    return null;
  }

  const [scheme, token] = headerValue.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token.trim() || null;
}

export function resolveAuthSecret(): string {
  return process.env.AUTH_SECRET?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || 'unityprep-dev-auth-secret';
}
