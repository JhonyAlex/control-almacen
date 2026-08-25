import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  AddManufacturedCoilBody,
  AddProductionRemnantBody,
  ConsumeInventoryItemParams,
  CreateOrderBody,
  SetOrderBlockedBody,
  SetOrderBlockedParams,
  UpdateOrderBody,
  UpdateOrderParams,
  DeleteOrderParams,
  ListOrderCoilsParams,
  ListOrdersQueryParams,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { coils, productionOrders } from "@workspace/db/schema";

const router: IRouter = Router();
const CAMISAS = new Set(["400", "475", "520", "22-6-22", "21-8-21", "40-6-40", "40-8-40", "47-5-47", "47-8-47", "52-8-52"]);
const MATERIALES = new Set(["OPP", "OPP RECICLADO"]);

const numeric = (value: string | number | null) => Number(value ?? 0);
const orderView = (order: typeof productionOrders.$inferSelect, fabricados: number) => ({
  id: order.id,
  ancho: numeric(order.ancho),
  micras: numeric(order.micras),
  camisa: order.camisa,
  material: order.material,
  metrosNecesarios: numeric(order.metrosNecesarios),
  metrosFabricados: fabricados,
  metrosPendientes: Math.max(0, numeric(order.metrosNecesarios) - fabricados),
  estado: order.estado === "BLOQUEADA"
    ? "BLOQUEADA"
    : order.estado === "FINALIZADA" || fabricados >= numeric(order.metrosNecesarios)
      ? "FINALIZADA"
      : "ACTIVA",
  creadoEn: order.creadoEn.toISOString(),
  finalizadaEn: order.finalizadaEn?.toISOString() ?? null,
});

async function ordersWithTotals(status?: string) {
  const orders = await db.select().from(productionOrders).orderBy(asc(productionOrders.id));
  const totals = await db
    .select({ ordenId: coils.ordenId, total: sql<string>`coalesce(sum(${coils.metros}), 0)` })
    .from(coils)
    .where(sql`${coils.ordenId} is not null`)
    .groupBy(coils.ordenId);
  const byOrder = new Map(totals.map((row) => [row.ordenId, numeric(row.total)]));
  return orders
    .map((order) => orderView(order, byOrder.get(order.id) ?? 0))
    .filter((order) => !status || order.estado === status);
}

router.get("/orders", async (req, res, next) => {
  try {
    const query = ListOrdersQueryParams.parse(req.query);
    res.json(await ordersWithTotals(query.status));
  } catch (error) {
    next(error);
  }
});

router.post("/orders", async (req, res, next) => {
  try {
    const body = CreateOrderBody.parse(req.body);
    if (!CAMISAS.has(String(body.camisa)) || !MATERIALES.has(body.material)) {
      res.status(400).json({ error: "Características no válidas" });
      return;
    }
    const [order] = await db.insert(productionOrders).values({
      ancho: String(body.ancho),
      micras: String(body.micras),
      camisa: String(body.camisa),
      material: body.material,
      metrosNecesarios: String(body.metrosNecesarios),
      estado: "ACTIVA",
    }).returning();
    res.status(201).json(orderView(order, 0));
  } catch (error) {
    next(error);
  }
});

router.delete("/orders/:id", async (req, res, next) => {
  try {
    const { id } = DeleteOrderParams.parse({ id: Number(req.params.id) });
    const active = await ordersWithTotals("ACTIVA");
    if (!active.some((order) => order.id === id)) {
      res.status(404).json({ error: "La orden no está activa o no existe" });
      return;
    }
    await db.transaction(async (tx) => {
      // Keep already registered material in the warehouse when its order is
      // removed; only the relationship to the deleted order is cleared.
      await tx.update(coils).set({ ordenId: null }).where(eq(coils.ordenId, id));
      await tx.delete(productionOrders).where(eq(productionOrders.id, id));
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.patch("/orders/:id", async (req, res, next) => {
  try {
    const { id } = UpdateOrderParams.parse({ id: Number(req.params.id) });
    const body = UpdateOrderBody.parse(req.body);
    if (!CAMISAS.has(String(body.camisa)) || !MATERIALES.has(body.material)) {
      res.status(400).json({ error: "Características no válidas" });
      return;
    }
    const [current] = await db.select().from(productionOrders).where(eq(productionOrders.id, id));
    if (!current) {
      res.status(404).json({ error: "La orden no existe" });
      return;
    }
    if (current.estado !== "ACTIVA") {
      res.status(400).json({ error: "Solo se pueden editar órdenes activas" });
      return;
    }
    const [{ total }] = await db.select({ total: sql<string>`coalesce(sum(${coils.metros}), 0)` }).from(coils).where(eq(coils.ordenId, id));
    if (numeric(total) > Number(body.metrosNecesarios)) {
      res.status(400).json({ error: "Los metros necesarios no pueden ser inferiores a los ya fabricados" });
      return;
    }
    const [updated] = await db.update(productionOrders).set({
      ancho: String(body.ancho),
      micras: String(body.micras),
      camisa: String(body.camisa),
      material: body.material,
      metrosNecesarios: String(body.metrosNecesarios),
    }).where(eq(productionOrders.id, id)).returning();
    res.json(orderView(updated, numeric(total)));
  } catch (error) {
    next(error);
  }
});

router.patch("/orders/:id/blocked", async (req, res, next) => {
  try {
    const { id } = SetOrderBlockedParams.parse({ id: Number(req.params.id) });
    const { blocked } = SetOrderBlockedBody.parse(req.body);
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(productionOrders).where(eq(productionOrders.id, id)).for("update");
      if (!current) return { kind: "MISSING" as const };

      const [{ total }] = await tx.select({ total: sql<string>`coalesce(sum(${coils.metros}), 0)` }).from(coils).where(eq(coils.ordenId, id));
      if (current.estado === "FINALIZADA" || numeric(total) >= numeric(current.metrosNecesarios)) {
        return { kind: "FINALIZED" as const };
      }

      const [updated] = await tx.update(productionOrders)
        .set({ estado: blocked ? "BLOQUEADA" : "ACTIVA" })
        .where(eq(productionOrders.id, id))
        .returning();
      return { kind: "UPDATED" as const, order: updated, total: numeric(total) };
    });
    if (result.kind === "MISSING") {
      res.status(404).json({ error: "La orden no existe" });
      return;
    }
    if (result.kind === "FINALIZED") {
      res.status(400).json({ error: "Las órdenes finalizadas no se pueden bloquear ni desbloquear" });
      return;
    }
    res.json(orderView(result.order, result.total));
  } catch (error) {
    next(error);
  }
});

router.get("/orders/:id/coils", async (req, res, next) => {
  try {
    const { id } = ListOrderCoilsParams.parse({ id: Number(req.params.id) });
    const items = await db.select().from(coils).where(eq(coils.ordenId, id)).orderBy(asc(coils.id));
    res.json(items.map((item) => ({
      id: item.id,
      tipo: item.tipo,
      metros: numeric(item.metros),
      ancho: numeric(item.ancho),
      micras: numeric(item.micras),
      camisa: item.camisa,
      material: item.material,
      estado: item.estado,
      ordenId: item.ordenId,
      creadoEn: item.creadoEn.toISOString(),
    })));
  } catch (error) {
    next(error);
  }
});

router.get("/inventory", async (_req, res, next) => {
  try {
    const items = await db.select().from(coils).where(eq(coils.estado, "DISPONIBLE")).orderBy(asc(coils.id));
    res.json({
      totalMetros: items.reduce((total, item) => total + numeric(item.metros), 0),
      items: items.map((item) => ({
        id: item.id,
        tipo: item.tipo,
        metros: numeric(item.metros),
        ancho: numeric(item.ancho),
        micras: numeric(item.micras),
        camisa: item.camisa,
        material: item.material,
        estado: item.estado,
        ordenId: item.ordenId,
        creadoEn: item.creadoEn.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/inventory/coils", async (req, res, next) => {
  try {
    const body = AddManufacturedCoilBody.parse(req.body);
    const result = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(productionOrders).where(eq(productionOrders.id, body.ordenId)).for("update");
      if (!order || order.estado !== "ACTIVA") throw new Error("ORDER_INACTIVE");
      const [created] = await tx.insert(coils).values({
        tipo: "BOBINA",
        metros: String(body.metros),
        ancho: order.ancho,
        micras: order.micras,
        camisa: order.camisa,
        material: order.material,
        estado: "DISPONIBLE",
        ordenId: order.id,
      }).returning();
      const [{ total }] = await tx.select({ total: sql<string>`coalesce(sum(${coils.metros}), 0)` }).from(coils).where(eq(coils.ordenId, order.id));
      if (numeric(total) >= numeric(order.metrosNecesarios)) {
        await tx.update(productionOrders).set({ estado: "FINALIZADA", finalizadaEn: new Date() }).where(eq(productionOrders.id, order.id));
      }
      return created;
    });
    res.status(201).json({ ...result, metros: numeric(result.metros), ancho: numeric(result.ancho), micras: numeric(result.micras), creadoEn: result.creadoEn.toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_INACTIVE") {
      res.status(400).json({ error: "La orden ya no está activa" });
      return;
    }
    next(error);
  }
});

router.post("/inventory/remnants", async (req, res, next) => {
  try {
    const body = AddProductionRemnantBody.parse(req.body);
    if (!CAMISAS.has(String(body.camisa)) || !MATERIALES.has(body.material)) {
      res.status(400).json({ error: "Características no válidas" });
      return;
    }
    const [created] = await db.insert(coils).values({
      tipo: "RESTO",
      metros: String(body.metros),
      ancho: String(body.ancho),
      micras: String(body.micras),
      camisa: String(body.camisa),
      material: body.material,
      estado: "DISPONIBLE",
    }).returning();
    res.status(201).json({ ...created, metros: numeric(created.metros), ancho: numeric(created.ancho), micras: numeric(created.micras), creadoEn: created.creadoEn.toISOString() });
  } catch (error) {
    next(error);
  }
});

router.post("/inventory/:id/consume", async (req, res, next) => {
  try {
    const { id } = ConsumeInventoryItemParams.parse({ id: Number(req.params.id) });
    const [updated] = await db.update(coils).set({ estado: "EN FÁBRICA" }).where(and(eq(coils.id, id), eq(coils.estado, "DISPONIBLE"))).returning();
    if (!updated) {
      res.status(404).json({ error: "La bobina ya no está disponible" });
      return;
    }
    res.json({ ...updated, metros: numeric(updated.metros), ancho: numeric(updated.ancho), micras: numeric(updated.micras), creadoEn: updated.creadoEn.toISOString() });
  } catch (error) {
    next(error);
  }
});

export default router;
