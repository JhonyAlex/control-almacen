import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import { authSessions, users, type User } from "@workspace/db/schema";

export const SESSION_COOKIE = "control_bobinas_session";
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const USER_ROLES = {
  ADMIN: "ADMIN",
  USER: "USER",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
export type PublicUser = Pick<User, "id" | "nombre" | "email" | "role" | "isActive" | "creadoEn">;

function secureCookies() {
  return process.env.COOKIE_SECURE === "true" || (process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production");
}

declare global {
  namespace Express {
    interface Request {
      authUser?: PublicUser;
    }
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function deriveKey(password: string, salt: string, keyLength: number, options: { N: number; r: number; p: number; maxmem: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    role: user.role as UserRole,
    isActive: user.isActive,
    creadoEn: user.creadoEn,
  };
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await deriveKey(password, salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [, n, r, p, salt, expectedHex] = storedHash.split("$");
  if (!n || !r || !p || !salt || !expectedHex) return false;

  try {
    const derivedKey = await deriveKey(password, salt, expectedHex.length / 2, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 32 * 1024 * 1024,
    });
    const expected = Buffer.from(expectedHex, "hex");
    return derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected);
  } catch {
    return false;
  }
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getSessionToken(req: Request) {
  const token = req.cookies?.[SESSION_COOKIE];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await db.insert(authSessions).values({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_MS),
    creadoEn: now,
    lastSeenAt: now,
  });
  return token;
}

export async function getSessionUser(req: Request) {
  const token = getSessionToken(req);
  if (!token) return null;

  const [result] = await db
    .select({ user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(
      and(
        eq(authSessions.tokenHash, hashSessionToken(token)),
        gt(authSessions.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  if (!result) return null;

  await db
    .update(authSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(authSessions.tokenHash, hashSessionToken(token)));

  return result.user;
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/" });
}

export async function deleteSession(req: Request) {
  const token = getSessionToken(req);
  if (!token) return;
  await db.delete(authSessions).where(eq(authSessions.tokenHash, hashSessionToken(token)));
}

export const requireAuth: RequestHandler = async (req, res, next: NextFunction) => {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ error: "Necesitas iniciar sesión" });
      return;
    }
    req.authUser = toPublicUser(user);
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.authUser?.role !== USER_ROLES.ADMIN) {
    res.status(403).json({ error: "Solo un administrador puede gestionar usuarios" });
    return;
  }
  next();
};
