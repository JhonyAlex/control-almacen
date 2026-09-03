import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const productionOrders = pgTable(
  "production_orders",
  {
    id: serial("id").primaryKey(),
    ancho: numeric("ancho", { precision: 12, scale: 2 }).notNull(),
    micras: numeric("micras", { precision: 12, scale: 2 }).notNull(),
    camisa: text("camisa").notNull(),
    material: text("material").notNull(),
    metrosNecesarios: numeric("metros_necesarios", {
      precision: 14,
      scale: 2,
    }).notNull(),
    estado: text("estado").notNull().default("ACTIVA"),
    origen: text("origen").notNull().default("MANUAL"),
    orden: integer("orden").notNull().default(0),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finalizadaEn: timestamp("finalizada_en", { withTimezone: true }),
    nota: text("nota"),
  },
  (table) => [
    uniqueIndex("production_orders_gp_active_group_idx")
      .on(
        table.ancho,
        table.micras,
        sql`lower(trim(${table.material}))`,
        sql`trim(${table.camisa})`,
      )
      .where(
        sql`${table.estado} = 'ACTIVA' AND ${table.origen} = 'GESTION_PEDIDOS'`,
      ),
    index("production_orders_orden_idx").on(table.orden),
  ],
);

export const productionOrderPedidos = pgTable(
  "production_order_pedidos",
  {
    id: serial("id").primaryKey(),
    ordenId: integer("orden_id")
      .notNull()
      .references(() => productionOrders.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().unique(),
    pedidoId: text("pedido_id").notNull(),
    numeroPedidoCliente: text("numero_pedido_cliente").notNull(),
    metros: numeric("metros", { precision: 14, scale: 2 }).notNull(),
    vinculadoEn: timestamp("vinculado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("production_order_pedidos_orden_id_idx").on(table.ordenId),
    index("production_order_pedidos_pedido_id_idx").on(table.pedidoId),
  ],
);

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
  creadoEn: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("USER"),
  isActive: boolean("is_active").notNull().default(true),
  creadoEn: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authSessions = pgTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  creadoEn: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertProductionOrderSchema = createInsertSchema(productionOrders);
export const insertProductionOrderPedidoSchema = createInsertSchema(
  productionOrderPedidos,
);
export const insertCoilSchema = createInsertSchema(coils);
export type ProductionOrder = typeof productionOrders.$inferSelect;
export type ProductionOrderPedido = typeof productionOrderPedidos.$inferSelect;
export type NewProductionOrderPedido =
  typeof productionOrderPedidos.$inferInsert;
export type Coil = typeof coils.$inferSelect;
export type User = typeof users.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
