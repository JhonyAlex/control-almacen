import { asc, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  coils,
  productionOrderCoilAssignments,
  productionOrders,
  type Coil,
  type ProductionOrderCoilAssignment,
} from "@workspace/db/schema";
import {
  normalizeCamisa,
  normalizeMaterialComparison,
  normalizeNumericString,
} from "../lib/nexus-order-normalizer";
import {
  selectCoilsForDeficit,
  type CoilCandidate,
} from "../lib/coil-stock-selection";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface OrderStockSpec {
  orderId: number;
  ancho: number | string;
  micras: number | string;
  material: string;
  camisa: string | number;
  metrosNecesarios: number | string;
}

export interface AutoAssignStockResult {
  assignedCount: number;
  assignedMeters: number;
  assignments: Array<{ coilId: number; metros: number }>;
}

const numeric = (value: string | number | null) => Number(value ?? 0);

const EMPTY_RESULT: AutoAssignStockResult = {
  assignedCount: 0,
  assignedMeters: 0,
  assignments: [],
};

// Meters counted towards an order combine:
// - coils manufactured for the order (`coils.ordenId`) that are not committed
//   elsewhere through a stock assignment, and
// - pre-existing stock coils assigned to the order
//   (`production_order_coil_assignments.ordenId`).
// Each coil is therefore counted at most once, never for two orders.
const unassignedCoilsForOrder = (orderId: number | ReturnType<typeof sql>) =>
  sql`coalesce((
    select sum(${coils.metros}) from ${coils}
    where ${coils.ordenId} = ${orderId}
      and not exists (
        select 1 from ${productionOrderCoilAssignments}
        where ${productionOrderCoilAssignments.coilId} = ${coils.id}
      )
  ), 0)`;

const assignedMetersForOrder = (orderId: number) =>
  sql`coalesce((
    select sum(${productionOrderCoilAssignments.metros})
    from ${productionOrderCoilAssignments}
    where ${productionOrderCoilAssignments.ordenId} = ${orderId}
  ), 0)`;

/**
 * Meters currently counted towards an order (see the helper queries above).
 */
export async function computeOrderCoveredMeters(
  executor: DbTransaction | typeof db,
  orderId: number,
): Promise<number> {
  const [row] = await executor
    .select({
      direct: unassignedCoilsForOrder(orderId).as<string>("direct"),
      assigned: assignedMetersForOrder(orderId).as<string>("assigned"),
    })
    .from(productionOrders)
    .where(sql`${productionOrders.id} = ${orderId}`);
  return numeric(row?.direct) + numeric(row?.assigned);
}

/**
 * Automatically assigns compatible available stock coils to an order until its
 * remaining meter deficit is covered. Must run inside the caller's
 * transaction: candidate rows are locked with FOR UPDATE and assignments are
 * protected by a unique constraint on coil_id, so two concurrent orders can
 * never take the same coil.
 *
 * `coils.ordenId` is never modified: the assignment table records the
 * commitment while the coil keeps its manufacturing origin.
 *
 * Matching uses the exact same normalization as NEXUS grouping.
 */
export async function autoAssignStockToOrder(
  tx: DbTransaction,
  order: OrderStockSpec,
  origen: string,
): Promise<AutoAssignStockResult> {
  const covered = await computeOrderCoveredMeters(tx, order.orderId);
  const needed = numeric(order.metrosNecesarios);
  const deficit = needed - covered;
  if (deficit <= 0) return EMPTY_RESULT;

  const anchoStr = normalizeNumericString(order.ancho);
  const micrasStr = normalizeNumericString(order.micras);
  const materialComp = normalizeMaterialComparison(order.material);
  const camisaNorm = normalizeCamisa(order.camisa);

  const candidates: Coil[] = await tx
    .select()
    .from(coils)
    .where(
      sql`${coils.estado} = 'DISPONIBLE'
        and ${coils.ancho} = ${anchoStr}
        and ${coils.micras} = ${micrasStr}
        and lower(trim(${coils.material})) = ${materialComp}
        and trim(${coils.camisa}) = ${camisaNorm}
        and ${coils.metros} > 0
        and not exists (
          select 1 from ${productionOrderCoilAssignments}
          where ${productionOrderCoilAssignments.coilId} = ${coils.id}
        )`,
    )
    .orderBy(asc(coils.metros), asc(coils.id))
    .for("update");

  const chosen = selectCoilsForDeficit(
    candidates.map((coil) => ({ id: coil.id, metros: numeric(coil.metros) })),
    deficit,
  );
  if (chosen.length === 0) return EMPTY_RESULT;

  const assignments: Array<{ coilId: number; metros: number }> = [];
  for (const candidate of chosen) {
    await tx.insert(productionOrderCoilAssignments).values({
      coilId: candidate.id,
      ordenId: order.orderId,
      metros: normalizeNumericString(candidate.metros),
      origen,
    });
    assignments.push({ coilId: candidate.id, metros: candidate.metros });
  }

  const assignedMeters = assignments.reduce(
    (total, item) => total + item.metros,
    0,
  );
  if (covered + assignedMeters >= needed) {
    // Same functional result as registering enough manufactured meters.
    await tx
      .update(productionOrders)
      .set({ estado: "FINALIZADA", finalizadaEn: new Date() })
      .where(sql`${productionOrders.id} = ${order.orderId}`);
  }

  return {
    assignedCount: assignments.length,
    assignedMeters,
    assignments,
  };
}

export interface CoilAssignmentInfo {
  ordenId: number;
  metros: number;
  origen: string;
  asignadoEn: string;
}

export function toAssignmentInfo(
  assignment: Pick<
    ProductionOrderCoilAssignment,
    "ordenId" | "metros" | "origen" | "asignadoEn"
  >,
): CoilAssignmentInfo {
  return {
    ordenId: assignment.ordenId,
    metros: numeric(assignment.metros),
    origen: assignment.origen,
    asignadoEn: assignment.asignadoEn.toISOString(),
  };
}

/** Batch-loads the stock assignments of the given coils (at most one each). */
export async function getAssignmentsByCoilIds(
  executor: DbTransaction | typeof db,
  coilIds: number[],
): Promise<Map<number, ProductionOrderCoilAssignment>> {
  const map = new Map<number, ProductionOrderCoilAssignment>();
  if (coilIds.length === 0) return map;
  const rows = await executor
    .select()
    .from(productionOrderCoilAssignments)
    .where(inArray(productionOrderCoilAssignments.coilId, coilIds));
  for (const row of rows) map.set(row.coilId, row);
  return map;
}
