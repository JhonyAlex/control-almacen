import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const productionOrders = pgTable("production_orders", {
  id: serial("id").primaryKey(),
  ancho: numeric("ancho", { precision: 12, scale: 2 }).notNull(),
  micras: numeric("micras", { precision: 12, scale: 2 }).notNull(),
  camisa: text("camisa").notNull(),
  material: text("material").notNull(),
  metrosNecesarios: numeric("metros_necesarios", { precision: 14, scale: 2 }).notNull(),
  estado: text("estado").notNull().default("ACTIVA"),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  finalizadaEn: timestamp("finalizada_en", { withTimezone: true }),
});

export const coils = pgTable("coils", {
  id: serial("id").primaryKey(),
  tipo: text("tipo").notNull(),
  metros: numeric("metros", { precision: 14, scale: 2 }).notNull(),
  ancho: numeric("ancho", { precision: 12, scale: 2 }).notNull(),
  micras: numeric("micras", { precision: 12, scale: 2 }).notNull(),
  camisa: text("camisa").notNull(),
  material: text("material").notNull(),
  estado: text("estado").notNull().default("DISPONIBLE"),
  ordenId: integer("orden_id").references(() => productionOrders.id),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("USER"),
  isActive: boolean("is_active").notNull().default(true),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProductionOrderSchema = createInsertSchema(productionOrders);
export const insertCoilSchema = createInsertSchema(coils);
export type ProductionOrder = typeof productionOrders.$inferSelect;
export type Coil = typeof coils.$inferSelect;
export type User = typeof users.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
