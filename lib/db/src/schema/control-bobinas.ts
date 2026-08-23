import { createInsertSchema } from "drizzle-zod";
import {
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

export const insertProductionOrderSchema = createInsertSchema(productionOrders);
export const insertCoilSchema = createInsertSchema(coils);
export type ProductionOrder = typeof productionOrders.$inferSelect;
export type Coil = typeof coils.$inferSelect;