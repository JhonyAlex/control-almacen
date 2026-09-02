import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
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
  ReorderOrdersBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  coils,
  productionOrders,
  productionOrderPedidos,
} from "@workspace/db/schema";
import { requireAdmin, requireAuth } from "../lib/auth";
import {
  getNexusGroupKey,
  normalizeCamisa,
  normalizeMaterialComparison,
} from "../lib/nexus-order-normalizer";

const router: IRouter = Router();
router.use(requireAuth);
const CAMISAS = new Set([
  "400",
  "475",
  "520",
  "22-6-22",
  "21-8-21",
  "40-6-40",
  "40-8-40",
  "47-5-47",
  "47-8-47",
  "52-8-52",
]);
const MATERIALES = new Set(["OPP", "OPP RECICLADO"]);

const numeric = (value: string | number | null) => Number(value ?? 0);

interface RelatedPedidoView {
  id: number;
  pedidoId: string;
  numeroPedidoCliente: string;
  metros: number;
  vinculadoEn: string;
}

const coilView = (
  coil: typeof coils.$inferSelect,
  pedidosRelacionados: RelatedPedidoView[] = [],
) => ({
  id: coil.id,
  tipo: coil.tipo,
  metros: numeric(coil.metros),
  ancho: numeric(coil.ancho),
  micras: numeric(coil.micras),
  camisa: coil.camisa,
  material: coil.material,
  estado: coil.estado,
  ordenId: coil.ordenId,
  pedidosRelacionados,
  creadoEn: coil.creadoEn.toISOString(),
});

async function getPedidosByOrderIds(orderIds: number[]) {
  const validIds = Array.from(
    new Set(
      orderIds.filter(
        (id): id is number => typeof id === "number" && id > 0,
      ),
    ),
  );
  const map = new Map<number, RelatedPedidoView[]>();
  if (validIds.length === 0) return map;

  const records = await db
    .select()
    .from(productionOrderPedidos)
    .where(inArray(productionOrderPedidos.ordenId, validIds))
    .orderBy(
      asc(productionOrderPedidos.vinculadoEn),
      asc(productionOrderPedidos.id),
    );

  for (const item of records) {
    const list = map.get(item.ordenId) ?? [];
    list.push({
      id: item.id,
      pedidoId: item.pedidoId,
      numeroPedidoCliente: item.numeroPedidoCliente,
      metros: numeric(item.metros),
      vinculadoEn: item.vinculadoEn.toISOString(),
    });
    map.set(item.ordenId, list);
  }
  return map;
}

const orderView = (
  order: typeof productionOrders.$inferSelect,
  fabricados: number,
  pedidosRelacionados: RelatedPedidoView[] = [],
) => ({
  id: order.id,
  ancho: numeric(order.ancho),
  micras: numeric(order.micras),
  camisa: order.camisa,
  material: order.material,
  metrosNecesarios: numeric(order.metrosNecesarios),
  metrosFabricados: fabricados,
  metrosPendientes: Math.max(0, numeric(order.metrosNecesarios) - fabricados),
  estado:
    order.estado === "BLOQUEADA"
      ? "BLOQUEADA"
      : order.estado === "FINALIZADA" ||
          fabricados >= numeric(order.metrosNecesarios)
        ? "FINALIZADA"
        : "ACTIVA",
  origen: (order.origen ?? "MANUAL") as "MANUAL" | "GESTION_PEDIDOS",
  pedidosRelacionados,
  creadoEn: order.creadoEn.toISOString(),
  finalizadaEn: order.finalizadaEn?.toISOString() ?? null,
});

async function ordersWithTotals(status?: string) {
  const orders = await db
    .select()
    .from(productionOrders)
    .orderBy(asc(productionOrders.orden), desc(productionOrders.id));
  const totals = await db
    .select({
      ordenId: coils.ordenId,
      total: sql<string>`coalesce(sum(${coils.metros}), 0)`,
    })
    .from(coils)
    .where(sql`${coils.ordenId} is not null`)
    .groupBy(coils.ordenId);
  const byOrder = new Map(
    totals.map((row) => [row.ordenId, numeric(row.total)]),
  );

  // Batch query related pedidos to prevent N+1 queries
  const allRelated = await db
    .select()
    .from(productionOrderPedidos)
    .orderBy(
      asc(productionOrderPedidos.vinculadoEn),
      asc(productionOrderPedidos.id),
    );

  const byOrderPedidos = new Map<number, RelatedPedidoView[]>();
  for (const item of allRelated) {
    const list = byOrderPedidos.get(item.ordenId) ?? [];
    list.push({
      id: item.id,
      pedidoId: item.pedidoId,
      numeroPedidoCliente: item.numeroPedidoCliente,
      metros: numeric(item.metros),
      vinculadoEn: item.vinculadoEn.toISOString(),
    });
    byOrderPedidos.set(item.ordenId, list);
  }

  return orders
    .map((order) =>
      orderView(
        order,
        byOrder.get(order.id) ?? 0,
        byOrderPedidos.get(order.id) ?? [],
      ),
    )
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

router.post("/orders", requireAdmin, async (req, res, next) => {
  try {
    const body = CreateOrderBody.parse(req.body);
    if (!CAMISAS.has(String(body.camisa)) || !MATERIALES.has(body.material)) {
      res.status(400).json({ error: "Características no válidas" });
      return;
    }
    const order = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(481929)`);
      const [created] = await tx
        .insert(productionOrders)
        .values({
          ancho: String(body.ancho),
          micras: String(body.micras),
          camisa: String(body.camisa),
          material: body.material,
          metrosNecesarios: String(body.metrosNecesarios),
          estado: "ACTIVA",
          origen: "MANUAL",
          orden: sql`coalesce((select min(${productionOrders.orden}) from ${productionOrders}), 0) - 1`,
        })
        .returning();
      return created;
    });
    res.status(201).json(orderView(order, 0, []));
  } catch (error) {
    next(error);
  }
});

router.patch("/orders/reorder", requireAdmin, async (req, res, next) => {
  try {
    const { orderIds } = ReorderOrdersBody.parse(req.body);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(481929)`);
      const activeOrders = await tx
        .select({ id: productionOrders.id })
        .from(productionOrders)
        .where(eq(productionOrders.estado, "ACTIVA"));
      const activeIds = new Set(activeOrders.map((order) => order.id));
      const isExactOrder =
        orderIds.length === activeIds.size &&
        new Set(orderIds).size === orderIds.length &&
        orderIds.every((id) => activeIds.has(id));
      if (!isExactOrder) return false;

      await Promise.all(
        orderIds.map((id, index) =>
          tx
            .update(productionOrders)
            .set({ orden: index })
            .where(eq(productionOrders.id, id)),
        ),
      );
      return true;
    });
    if (!result) {
      res.status(409).json({ error: "La lista de órdenes cambió. Actualiza e inténtalo de nuevo." });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.delete("/orders/:id", requireAdmin, async (req, res, next) => {
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
      await tx
        .update(coils)
        .set({ ordenId: null })
        .where(eq(coils.ordenId, id));
      await tx.delete(productionOrders).where(eq(productionOrders.id, id));
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.patch("/orders/:id", requireAdmin, async (req, res, next) => {
  try {
    const { id } = UpdateOrderParams.parse({ id: Number(req.params.id) });
    const body = UpdateOrderBody.parse(req.body);
    if (!CAMISAS.has(String(body.camisa)) || !MATERIALES.has(body.material)) {
      res.status(400).json({ error: "Características no válidas" });
      return;
    }
    const [current] = await db
      .select()
      .from(productionOrders)
      .where(eq(productionOrders.id, id));
    if (!current) {
      res.status(404).json({ error: "La orden no existe" });
      return;
    }
    if (current.origen === "GESTION_PEDIDOS") {
      res.status(409).json({
        error:
          "Las órdenes creadas por Gestión Pedidos no se pueden editar manualmente",
        code: "AUTOMATIC_ORDER_NOT_EDITABLE",
      });
      return;
    }
    if (current.estado !== "ACTIVA") {
      res.status(400).json({ error: "Solo se pueden editar órdenes activas" });
      return;
    }
    const [{ total }] = await db
      .select({ total: sql<string>`coalesce(sum(${coils.metros}), 0)` })
      .from(coils)
      .where(eq(coils.ordenId, id));
    if (numeric(total) > Number(body.metrosNecesarios)) {
      res.status(400).json({
        error:
          "Los metros necesarios no pueden ser inferiores a los ya fabricados",
      });
      return;
    }
    const [updated] = await db
      .update(productionOrders)
      .set({
        ancho: String(body.ancho),
        micras: String(body.micras),
        camisa: String(body.camisa),
        material: body.material,
        metrosNecesarios: String(body.metrosNecesarios),
      })
      .where(eq(productionOrders.id, id))
      .returning();

    const related = await db
      .select()
      .from(productionOrderPedidos)
      .where(eq(productionOrderPedidos.ordenId, id))
      .orderBy(asc(productionOrderPedidos.vinculadoEn));

    res.json(
      orderView(
        updated,
        numeric(total),
        related.map((r) => ({
          id: r.id,
          pedidoId: r.pedidoId,
          numeroPedidoCliente: r.numeroPedidoCliente,
          metros: numeric(r.metros),
          vinculadoEn: r.vinculadoEn.toISOString(),
        })),
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.patch("/orders/:id/blocked", requireAdmin, async (req, res, next) => {
  try {
    const { id } = SetOrderBlockedParams.parse({ id: Number(req.params.id) });
    const { blocked } = SetOrderBlockedBody.parse(req.body);
    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, id))
        .for("update");
      if (!current) return { kind: "MISSING" as const };

      const [{ total }] = await tx
        .select({ total: sql<string>`coalesce(sum(${coils.metros}), 0)` })
        .from(coils)
        .where(eq(coils.ordenId, id));
      if (
        current.estado === "FINALIZADA" ||
        numeric(total) >= numeric(current.metrosNecesarios)
      ) {
        return { kind: "FINALIZED" as const };
      }

      // Check if unblocking an automatic order would collide with an already active automatic order
      if (!blocked && current.origen === "GESTION_PEDIDOS") {
        const groupKey = getNexusGroupKey({
          ancho: Number(current.ancho),
          micras: Number(current.micras),
          material: current.material,
          camisa: current.camisa,
        });
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${"nexus_group:" + groupKey}, 0))`,
        );

        const [duplicateActive] = await tx
          .select()
          .from(productionOrders)
          .where(
            and(
              eq(productionOrders.estado, "ACTIVA"),
              eq(productionOrders.origen, "GESTION_PEDIDOS"),
              sql`${productionOrders.id} != ${current.id}`,
              eq(productionOrders.ancho, current.ancho),
              eq(productionOrders.micras, current.micras),
              sql`lower(trim(${productionOrders.material})) = ${normalizeMaterialComparison(current.material)}`,
              sql`trim(${productionOrders.camisa}) = ${normalizeCamisa(current.camisa)}`,
            ),
          );

        if (duplicateActive) {
          return { kind: "DUPLICATE_ACTIVE_GROUP" as const };
        }
      }

      const [updated] = await tx
        .update(productionOrders)
        .set({ estado: blocked ? "BLOQUEADA" : "ACTIVA" })
        .where(eq(productionOrders.id, id))
        .returning();

      const related = await tx
        .select()
        .from(productionOrderPedidos)
        .where(eq(productionOrderPedidos.ordenId, id))
        .orderBy(asc(productionOrderPedidos.vinculadoEn));

      return {
        kind: "UPDATED" as const,
        order: updated,
        total: numeric(total),
        pedidos: related.map((r) => ({
          id: r.id,
          pedidoId: r.pedidoId,
          numeroPedidoCliente: r.numeroPedidoCliente,
          metros: numeric(r.metros),
          vinculadoEn: r.vinculadoEn.toISOString(),
        })),
      };
    });

    if (result.kind === "MISSING") {
      res.status(404).json({ error: "La orden no existe" });
      return;
    }
    if (result.kind === "FINALIZED") {
      res.status(400).json({
        error: "Las órdenes finalizadas no se pueden bloquear ni desbloquear",
      });
      return;
    }
    if (result.kind === "DUPLICATE_ACTIVE_GROUP") {
      res.status(409).json({
        error:
          "No se puede desbloquear la orden porque ya existe otra orden activa para las mismas características",
        code: "CANNOT_UNBLOCK_DUPLICATE_ACTIVE_GROUP",
      });
      return;
    }
    res.json(orderView(result.order, result.total, result.pedidos));
  } catch (error: any) {
    const isDuplicateIndex =
      error?.code === "23505" ||
      error?.cause?.code === "23505" ||
      String(error?.message).includes("production_orders_gp_active_group_idx");
    if (isDuplicateIndex) {
      res.status(409).json({
        error:
          "No se puede desbloquear la orden porque ya existe otra orden activa para las mismas características",
        code: "CANNOT_UNBLOCK_DUPLICATE_ACTIVE_GROUP",
      });
      return;
    }
    next(error);
  }
});

router.get("/orders/:id/coils", async (req, res, next) => {
  try {
    const { id } = ListOrderCoilsParams.parse({ id: Number(req.params.id) });
    const items = await db
      .select()
      .from(coils)
      .where(eq(coils.ordenId, id))
      .orderBy(asc(coils.id));
    const pedidosMap = await getPedidosByOrderIds([id]);
    const related = pedidosMap.get(id) ?? [];
    res.json(items.map((item) => coilView(item, related)));
  } catch (error) {
    next(error);
  }
});

router.get("/inventory", async (_req, res, next) => {
  try {
    const items = await db
      .select()
      .from(coils)
      .where(eq(coils.estado, "DISPONIBLE"))
      .orderBy(asc(coils.id));
    const orderIds = items
      .map((i) => i.ordenId)
      .filter((id): id is number => id !== null);
    const pedidosMap = await getPedidosByOrderIds(orderIds);
    res.json({
      totalMetros: items.reduce(
        (total, item) => total + numeric(item.metros),
        0,
      ),
      items: items.map((item) =>
        coilView(
          item,
          item.ordenId ? (pedidosMap.get(item.ordenId) ?? []) : [],
        ),
      ),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/inventory/coils", async (req, res, next) => {
  try {
    const body = AddManufacturedCoilBody.parse(req.body);
    const { created, related } = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, body.ordenId))
        .for("update");
      if (!order || order.estado !== "ACTIVA")
        throw new Error("ORDER_INACTIVE");
      const [inserted] = await tx
        .insert(coils)
        .values({
          tipo: "BOBINA",
          metros: String(body.metros),
          ancho: order.ancho,
          micras: order.micras,
          camisa: order.camisa,
          material: order.material,
          estado: "DISPONIBLE",
          ordenId: order.id,
        })
        .returning();
      const [{ total }] = await tx
        .select({ total: sql<string>`coalesce(sum(${coils.metros}), 0)` })
        .from(coils)
        .where(eq(coils.ordenId, order.id));
      if (numeric(total) >= numeric(order.metrosNecesarios)) {
        await tx
          .update(productionOrders)
          .set({ estado: "FINALIZADA", finalizadaEn: new Date() })
          .where(eq(productionOrders.id, order.id));
      }
      const relatedRecords = await tx
        .select()
        .from(productionOrderPedidos)
        .where(eq(productionOrderPedidos.ordenId, order.id))
        .orderBy(
          asc(productionOrderPedidos.vinculadoEn),
          asc(productionOrderPedidos.id),
        );
      const relatedList: RelatedPedidoView[] = relatedRecords.map((r) => ({
        id: r.id,
        pedidoId: r.pedidoId,
        numeroPedidoCliente: r.numeroPedidoCliente,
        metros: numeric(r.metros),
        vinculadoEn: r.vinculadoEn.toISOString(),
      }));
      return { created: inserted, related: relatedList };
    });
    res.status(201).json(coilView(created, related));
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
    const [created] = await db
      .insert(coils)
      .values({
        tipo: "RESTO",
        metros: String(body.metros),
        ancho: String(body.ancho),
        micras: String(body.micras),
        camisa: String(body.camisa),
        material: body.material,
        estado: "DISPONIBLE",
      })
      .returning();
    res.status(201).json(coilView(created, []));
  } catch (error) {
    next(error);
  }
});

router.post("/inventory/:id/consume", requireAdmin, async (req, res, next) => {
  try {
    const { id } = ConsumeInventoryItemParams.parse({
      id: Number(req.params.id),
    });
    const [updated] = await db
      .update(coils)
      .set({ estado: "EN FÁBRICA" })
      .where(and(eq(coils.id, id), eq(coils.estado, "DISPONIBLE")))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "La bobina ya no está disponible" });
      return;
    }
    let related: RelatedPedidoView[] = [];
    if (updated.ordenId) {
      const pedidosMap = await getPedidosByOrderIds([updated.ordenId]);
      related = pedidosMap.get(updated.ordenId) ?? [];
    }
    res.json(coilView(updated, related));
  } catch (error) {
    next(error);
  }
});

export default router;
