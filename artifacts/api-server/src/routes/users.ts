import { Router, type IRouter } from "express";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { authSessions, users } from "@workspace/db/schema";
import { hashPassword, normalizeEmail, requireAdmin, requireAuth, toPublicUser, USER_ROLES } from "../lib/auth";

const router: IRouter = Router();
const userIdParams = z.object({ id: z.coerce.number().int().positive() });
const createUserSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  email: z.string().trim().email("Introduce un email válido").max(200),
  password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres").max(200),
  role: z.enum([USER_ROLES.ADMIN, USER_ROLES.USER]).default(USER_ROLES.USER),
});
const updateUserSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  email: z.string().trim().email("Introduce un email válido").max(200),
  role: z.enum([USER_ROLES.ADMIN, USER_ROLES.USER]),
});

router.use(requireAuth, requireAdmin);

router.get("/users", async (_req, res, next) => {
  try {
    const rows = await db.select().from(users).orderBy(asc(users.id));
    res.json(rows.map(toPublicUser));
  } catch (error) {
    next(error);
  }
});

router.post("/users", async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body);
    const [user] = await db.insert(users).values({
      nombre: body.nombre,
      email: normalizeEmail(body.email),
      passwordHash: await hashPassword(body.password),
      role: body.role,
      isActive: true,
    }).returning();
    res.status(201).json(toPublicUser(user));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }
    next(error);
  }
});

router.patch("/users/:id", async (req, res, next) => {
  try {
    const { id } = userIdParams.parse(req.params);
    const body = updateUserSchema.parse(req.body);
    if (req.authUser?.id === id && body.role !== req.authUser.role) {
      res.status(400).json({ error: "No puedes cambiar tu propio rol" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(481928)`);
      const [current] = await tx.select().from(users).where(eq(users.id, id)).for("update");
      if (!current) return { kind: "MISSING" as const };
      if (current.role === USER_ROLES.ADMIN && body.role !== USER_ROLES.ADMIN && current.isActive) {
        const [{ total }] = await tx
          .select({ total: count() })
          .from(users)
          .where(and(eq(users.role, USER_ROLES.ADMIN), eq(users.isActive, true)));
        if (total <= 1) return { kind: "LAST_ADMIN" as const };
      }
      const [updated] = await tx.update(users).set({
        nombre: body.nombre,
        email: normalizeEmail(body.email),
        role: body.role,
      }).where(eq(users.id, id)).returning();
      return { kind: "UPDATED" as const, user: updated };
    });

    if (result.kind === "MISSING") {
      res.status(404).json({ error: "El usuario no existe" });
      return;
    }
    if (result.kind === "LAST_ADMIN") {
      res.status(400).json({ error: "Debe permanecer al menos un administrador activo" });
      return;
    }
    res.json(toPublicUser(result.user));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }
    next(error);
  }
});

router.patch("/users/:id/status", async (req, res, next) => {
  try {
    const { id } = userIdParams.parse(req.params);
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    if (req.authUser?.id === id && !isActive) {
      res.status(400).json({ error: "No puedes desactivar tu propia cuenta" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(481928)`);
      const [current] = await tx.select().from(users).where(eq(users.id, id)).for("update");
      if (!current) return { kind: "MISSING" as const };
      if (!isActive && current.role === USER_ROLES.ADMIN) {
        const [{ total }] = await tx.select({ total: count() }).from(users).where(and(eq(users.role, USER_ROLES.ADMIN), eq(users.isActive, true)));
        if (total <= 1) return { kind: "LAST_ADMIN" as const };
      }
      const [updated] = await tx.update(users).set({ isActive }).where(eq(users.id, id)).returning();
      return { kind: "UPDATED" as const, user: updated };
    });
    if (result.kind === "MISSING") {
      res.status(404).json({ error: "El usuario no existe" });
      return;
    }
    if (result.kind === "LAST_ADMIN") {
      res.status(400).json({ error: "Debe permanecer al menos un administrador activo" });
      return;
    }
    res.json(toPublicUser(result.user));
  } catch (error) {
    next(error);
  }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    const { id } = userIdParams.parse(req.params);
    if (req.authUser?.id === id) {
      res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
      return;
    }
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(481928)`);
      const [current] = await tx.select().from(users).where(eq(users.id, id)).for("update");
      if (!current) return { kind: "MISSING" as const };
      if (current.role === USER_ROLES.ADMIN && current.isActive) {
        const [{ total }] = await tx.select({ total: count() }).from(users).where(and(eq(users.role, USER_ROLES.ADMIN), eq(users.isActive, true)));
        if (total <= 1) return { kind: "LAST_ADMIN" as const };
      }
      await tx.delete(users).where(eq(users.id, id));
      return { kind: "DELETED" as const };
    });
    if (result.kind === "MISSING") {
      res.status(404).json({ error: "El usuario no existe" });
      return;
    }
    if (result.kind === "LAST_ADMIN") {
      res.status(400).json({ error: "Debe permanecer al menos un administrador activo" });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/users/:id/password", async (req, res, next) => {
  try {
    const { id } = userIdParams.parse(req.params);
    const { password } = z.object({
      password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres").max(200),
    }).parse(req.body);
    const [updated] = await db.transaction(async (tx) => {
      const [changed] = await tx.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, id)).returning();
      if (changed) await tx.delete(authSessions).where(eq(authSessions.userId, id));
      return [changed] as const;
    });
    if (!updated) {
      res.status(404).json({ error: "El usuario no existe" });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
