import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { authSessions, users } from "@workspace/db/schema";
import { hashPassword, normalizeEmail, requireAdmin, requireAuth, toPublicUser } from "../lib/auth";

const router: IRouter = Router();
const userIdParams = z.object({ id: z.coerce.number().int().positive() });
const createUserSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  email: z.string().trim().email("Introduce un email válido").max(200),
  password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres").max(200),
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
      role: "USER",
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

router.patch("/users/:id/status", async (req, res, next) => {
  try {
    const { id } = userIdParams.parse(req.params);
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    if (req.authUser?.id === id && !isActive) {
      res.status(400).json({ error: "No puedes desactivar tu propia cuenta" });
      return;
    }

    const [updated] = await db.update(users).set({ isActive }).where(eq(users.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "El usuario no existe" });
      return;
    }
    res.json(toPublicUser(updated));
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
