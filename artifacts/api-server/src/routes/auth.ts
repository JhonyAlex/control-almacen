import { Router, type IRouter } from "express";
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import {
  createSession,
  clearSessionCookie,
  deleteSession,
  getSessionUser,
  hashPassword,
  normalizeEmail,
  setSessionCookie,
  toPublicUser,
  verifyPassword,
  USER_ROLES,
} from "../lib/auth";

const router: IRouter = Router();

const credentialsSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  email: z.string().trim().email("Introduce un email válido").max(200),
  password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres").max(200),
});

function sessionResponse(user: Parameters<typeof toPublicUser>[0]) {
  return { authenticated: true, user: toPublicUser(user) };
}

router.get("/auth/bootstrap", async (_req, res, next) => {
  try {
    const [{ total }] = await db.select({ total: count() }).from(users);
    res.json({ needsSetup: total === 0 });
  } catch (error) {
    next(error);
  }
});

router.get("/auth/session", async (req, res, next) => {
  try {
    const user = await getSessionUser(req);
    res.json(user ? sessionResponse(user) : { authenticated: false, user: null });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/register-first", async (req, res, next) => {
  try {
    const body = credentialsSchema.parse(req.body);
    const email = normalizeEmail(body.email);
    const passwordHash = await hashPassword(body.password);

    const user = await db.transaction(async (tx) => {
      // Serialize bootstrap attempts so two simultaneous requests cannot both
      // become the first administrator.
      await tx.execute(sql`select pg_advisory_xact_lock(481927)`);
      const [{ total }] = await tx.select({ total: count() }).from(users);
      if (total > 0) throw new Error("SETUP_ALREADY_COMPLETED");

      const [created] = await tx.insert(users).values({
        nombre: body.nombre,
        email,
        passwordHash,
        role: USER_ROLES.ADMIN,
        isActive: true,
      }).returning();
      return created;
    });

    setSessionCookie(res, await createSession(user.id));
    res.status(201).json(sessionResponse(user));
  } catch (error) {
    if (error instanceof Error && error.message === "SETUP_ALREADY_COMPLETED") {
      res.status(409).json({ error: "La configuración inicial ya está completada" });
      return;
    }
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }
    next(error);
  }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().trim().email("Introduce un email válido"),
      password: z.string().min(1, "La contraseña es obligatoria"),
    }).parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(body.email))).limit(1);

    if (!user || !user.isActive || !(await verifyPassword(body.password, user.passwordHash))) {
      res.status(401).json({ error: "Email o contraseña incorrectos" });
      return;
    }

    setSessionCookie(res, await createSession(user.id));
    res.json(sessionResponse(user));
  } catch (error) {
    next(error);
  }
});

router.post("/auth/logout", async (req, res, next) => {
  try {
    await deleteSession(req);
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
