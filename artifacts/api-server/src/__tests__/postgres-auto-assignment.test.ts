import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import pg from "pg";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:test@localhost:5439/control_bobinas_autoassign_test";
process.env.GESTION_PEDIDOS_INTEGRATION_TOKEN =
  "test-secret-nexus-token-xyz-123456";

const { Pool, Client } = pg;
const TEST_DB_URL = process.env.DATABASE_URL;
const TEST_TOKEN = "test-secret-nexus-token-xyz-123456";

interface CoilRow {
  id: number;
  tipo: string;
  metros: string;
  ancho: string;
  micras: string;
  camisa: string;
  material: string;
  estado: string;
  orden_id: number | null;
}

describe("Autoasignación de stock y edición de material contra PostgreSQL real", () => {
  let adminClient: pg.Client;
  let pool: pg.Pool;
  let server: http.Server;
  let baseUrl: string;
  let sessionCookie: string;

  const seedCoil = async (overrides: Partial<CoilRow> = {}): Promise<number> => {
    const values = {
      tipo: "RESTO",
      metros: "5000.00",
      ancho: "1200.00",
      micras: "30.00",
      camisa: 400,
      material: "OPP",
      estado: "DISPONIBLE",
      orden_id: null as number | null,
      ...overrides,
    };
    const res = await pool.query(
      `INSERT INTO coils (tipo, metros, ancho, micras, camisa, material, estado, orden_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        values.tipo,
        values.metros,
        values.ancho,
        values.micras,
        values.camisa,
        values.material,
        values.estado,
        values.orden_id,
      ],
    );
    return res.rows[0].id as number;
  };

  const createOrder = async (body: Record<string, unknown>) => {
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  };

  const nexusCall = async (payload: Record<string, unknown>) => {
    const res = await fetch(
      `${baseUrl}/api/integrations/gestion-pedidos/nexus-orders`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify(payload),
      },
    );
    return { status: res.status, body: (await res.json()) as any };
  };

  const assignmentsOf = async (orderId?: number) => {
    const query = orderId
      ? "SELECT * FROM production_order_coil_assignments WHERE orden_id = $1 ORDER BY coil_id"
      : "SELECT * FROM production_order_coil_assignments ORDER BY coil_id";
    const res = orderId
      ? await pool.query(query, [orderId])
      : await pool.query(query);
    return res.rows;
  };

  before(async () => {
    adminClient = new Client({
      connectionString: "postgresql://postgres:test@localhost:5439/postgres",
    });
    await adminClient.connect();
    await adminClient.query(
      "DROP DATABASE IF EXISTS control_bobinas_autoassign_test",
    );
    await adminClient.query(
      "CREATE DATABASE control_bobinas_autoassign_test",
    );

    const dbModule = await import("@workspace/db");
    pool = dbModule.pool;

    const { fileURLToPath } = await import("node:url");
    const migrationsFolder = fileURLToPath(
      new URL("../../../../lib/db/drizzle", import.meta.url),
    );
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(dbModule.db, { migrationsFolder });

    const appModule = await import("../app");
    const app = appModule.default;
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // Register the first admin to obtain a session cookie for admin endpoints
    const regRes = await fetch(`${baseUrl}/api/auth/register-first`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: "Admin Pigmea",
        email: "admin@pigmea.test",
        password: "SuperSecretPassword123!",
      }),
    });
    const setCookie = regRes.headers.get("set-cookie") || "";
    sessionCookie = setCookie.split(";")[0];
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (pool) {
      await pool.end();
    }
    if (adminClient) {
      await adminClient.query(
        "DROP DATABASE IF EXISTS control_bobinas_autoassign_test",
      );
      await adminClient.end();
    }
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE TABLE production_order_coil_assignments, production_order_pedidos, coils, production_orders RESTART IDENTITY CASCADE",
    );
  });

  // =========================================================================
  // AUTOASIGNACIÓN EN CREACIÓN MANUAL
  // =========================================================================

  it("A1. Orden manual compatible + resto disponible (Añadir Resto) → asignación automática sin bobina duplicada", async () => {
    const coilId = await seedCoil({ metros: "6000.00" });

    const { status, body } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 5000,
    });

    assert.equal(status, 201);
    assert.equal(body.metrosFabricados, 6000);
    assert.equal(body.metrosPendientes, 0);
    assert.equal(body.estado, "FINALIZADA");
    assert.ok(body.finalizadaEn, "finalizadaEn refleja la finalización automática");

    const assignments = await assignmentsOf(body.id);
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].coil_id, coilId);
    assert.equal(Number(assignments[0].metros), 6000);
    assert.equal(assignments[0].origen, "AUTO_STOCK");

    // No duplicated coil was created
    const coilsCount = await pool.query("SELECT COUNT(*) AS count FROM coils");
    assert.equal(Number(coilsCount.rows[0].count), 1);
  });

  it("A2. Bobina fabricada (tipo BOBINA) compatible y disponible no se reasigna a otra orden", async () => {
    // Bobina registrada mediante "Bobina fabricada" para su orden de origen
    const originOrder = await pool.query(
      `INSERT INTO production_orders (ancho, micras, camisa, material, metros_necesarios, estado, origen)
       VALUES ('1200.00','30.00','400','OPP','20000.00','ACTIVA','MANUAL') RETURNING id`,
    );
    const originOrderId = originOrder.rows[0].id as number;
    const coilId = await seedCoil({
      tipo: "BOBINA",
      metros: "9000.00",
      orden_id: originOrderId,
    });

    const { body } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 8000,
    });

    // La nueva orden no puede apropiarse de la bobina fabricada
    assert.equal(body.metrosFabricados, 0);
    assert.equal(body.metrosPendientes, 8000);
    assert.equal(await assignmentsOf().then((r) => r.length), 0);

    // La bobina conserva su orden de origen y su cobertura intactas
    const coilRes = await pool.query("SELECT * FROM coils WHERE id = $1", [
      coilId,
    ]);
    assert.equal(coilRes.rows[0].orden_id, originOrderId, "coils.ordenId preservado");
    const ordersRes = await fetch(`${baseUrl}/api/orders`, {
      headers: { Cookie: sessionCookie },
    });
    const orders = (await ordersRes.json()) as any[];
    const origin = orders.find((o) => o.id === originOrderId);
    assert.equal(origin.metrosFabricados, 9000, "la orden origen conserva su fabricado");
  });

  it("A3. Bobina incompatible (material distinto) → no se asigna", async () => {
    await seedCoil({ material: "OPP RECICLADO" });
    const { body } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 5000,
    });
    assert.equal(body.metrosFabricados, 0);
    assert.equal(await assignmentsOf(body.id).then((r) => r.length), 0);
  });

  it("A4. Bobina incompatible (camisa con otras cifras) → no se asigna", async () => {
    await seedCoil({ camisa: "475" });
    const { body } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 5000,
    });
    assert.equal(body.metrosFabricados, 0);
    assert.equal(await assignmentsOf(body.id).then((r) => r.length), 0);
  });

  it("A5. Bobina incompatible (ancho/micras distintos) → no se asigna", async () => {
    await seedCoil({ ancho: "1250.00", micras: "35.00" });
    const { body } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 5000,
    });
    assert.equal(body.metrosFabricados, 0);
  });

  it("A6. Bobina EN FÁBRICA → no se asigna", async () => {
    await seedCoil({ estado: "EN FÁBRICA", metros: "9000.00" });
    const { body } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 5000,
    });
    assert.equal(body.metrosFabricados, 0);
    assert.equal(await assignmentsOf(body.id).then((r) => r.length), 0);
  });

  it("A7. Bobina ya asignada a otra orden → no se reutiliza", async () => {
    await seedCoil({ metros: "30000.00" });
    const first = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 10000,
    });
    const second = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 10000,
    });
    assert.equal(await assignmentsOf(first.body.id).then((r) => r.length), 1);
    assert.equal(await assignmentsOf(second.body.id).then((r) => r.length), 0);
    assert.equal(second.body.metrosFabricados, 0);
  });

  it("A8. Varias bobinas necesarias → suma correcta y sin exceso", async () => {
    await seedCoil({ metros: "3000.00" });
    await seedCoil({ metros: "2500.00" });
    await seedCoil({ metros: "9000.00" });
    const { body } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 5000,
    });
    // Preferencia: una sola bobina suficiente más pequeña → 9000 cubre todo
    assert.equal(body.metrosFabricados, 9000);
    assert.equal(await assignmentsOf(body.id).then((r) => r.length), 1);
  });

  it("A9. Sin bobina individual suficiente → combina varias hasta cubrir", async () => {
    await seedCoil({ metros: "2000.00" });
    await seedCoil({ metros: "2600.00" });
    const { body } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 4000,
    });
    const assignments = await assignmentsOf(body.id);
    assert.equal(assignments.length, 2);
    assert.equal(body.metrosFabricados, 4600);
    assert.equal(body.metrosPendientes, 0);
    assert.equal(body.estado, "FINALIZADA");
  });

  it("A10. Metros insuficientes en stock → la orden conserva solo el déficit", async () => {
    await seedCoil({ metros: "1500.00" });
    const { body } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 5000,
    });
    assert.equal(body.metrosFabricados, 1500);
    assert.equal(body.metrosPendientes, 3500);
    assert.equal(body.estado, "ACTIVA");
  });

  it("A11. Normalización: material con distinto casing/espacios coincide", async () => {
    await seedCoil({ material: "  opp reciclado " });
    const { body } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP RECICLADO",
      metrosNecesarios: 4000,
    });
    assert.equal(body.metrosFabricados, 5000);
    assert.equal(await assignmentsOf(body.id).then((r) => r.length), 1);
  });

  it("A12. Normalización: camisa con espacios coincide (trim)", async () => {
    await seedCoil({ camisa: " 400 " });
    const { body } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 4000,
    });
    assert.equal(body.metrosFabricados, 5000);
  });

  // =========================================================================
  // NEXUS: ORDER_CREATED / ORDER_UPDATED / IDEMPOTENCIA
  // =========================================================================

  it("B1. ORDER_CREATED asigna stock disponible", async () => {
    await seedCoil({ metros: "4500.00" });
    const { body } = await nexusCall({
      eventId: "a1000000-0000-4000-8000-000000000001",
      pedidoId: "PED-A1",
      numeroPedidoCliente: "2600101",
      metros: 4000,
      bobinaMadre: 1200,
      camisa: "400",
      tipoMaterial: "OPP",
      micras: 30,
    });
    assert.equal(body.action, "ORDER_CREATED");
    const assignments = await assignmentsOf(body.orderId);
    assert.equal(assignments.length, 1);
    const orderRes = await pool.query(
      "SELECT estado FROM production_orders WHERE id = $1",
      [body.orderId],
    );
    assert.equal(orderRes.rows[0].estado, "FINALIZADA");
  });

  it("B2. ORDER_UPDATED busca únicamente stock adicional para el nuevo déficit", async () => {
    // Stock: 1 bobina de 3000. Primer pedido 5000m → asigna 3000 (déficit 2000 queda pendiente).
    await seedCoil({ metros: "3000.00" });
    const first = await nexusCall({
      eventId: "b1000000-0000-4000-8000-000000000001",
      pedidoId: "PED-B1",
      numeroPedidoCliente: "2600201",
      metros: 5000,
      bobinaMadre: 1200,
      camisa: "400",
      tipoMaterial: "OPP",
      micras: 30,
    });
    assert.equal(first.body.action, "ORDER_CREATED");
    assert.equal(await assignmentsOf(first.body.orderId).then((r) => r.length), 1);

    // Llega stock adicional y otro pedido de 4000m: déficit nuevo = 9000-3000 = 6000
    await seedCoil({ metros: "6500.00" });
    const second = await nexusCall({
      eventId: "b1000000-0000-4000-8000-000000000002",
      pedidoId: "PED-B2",
      numeroPedidoCliente: "2600202",
      metros: 4000,
      bobinaMadre: 1200,
      camisa: "400",
      tipoMaterial: "OPP",
      micras: 30,
    });
    assert.equal(second.body.action, "ORDER_UPDATED");
    assert.equal(second.body.orderId, first.body.orderId);
    assert.equal(second.body.totalMetros, 9000);

    const assignments = await assignmentsOf(first.body.orderId);
    assert.equal(assignments.length, 2, "solo la bobina adicional se asigna");
    const meters = assignments.map((a) => Number(a.metros)).sort((a, b) => a - b);
    assert.deepEqual(meters, [3000, 6500]);

    const orderRes = await pool.query(
      "SELECT estado FROM production_orders WHERE id = $1",
      [first.body.orderId],
    );
    assert.equal(orderRes.rows[0].estado, "FINALIZADA");
  });

  it("B3. Reintento del mismo eventId (ALREADY_PROCESSED) no duplica asignaciones", async () => {
    await seedCoil({ metros: "4500.00" });
    const payload = {
      eventId: "b2000000-0000-4000-8000-000000000001",
      pedidoId: "PED-B3",
      numeroPedidoCliente: "2600301",
      metros: 4000,
      bobinaMadre: 1200,
      camisa: "400",
      tipoMaterial: "OPP",
      micras: 30,
    };
    const first = await nexusCall(payload);
    assert.equal(first.body.action, "ORDER_CREATED");
    const retry = await nexusCall(payload);
    assert.equal(retry.body.action, "ALREADY_PROCESSED");
    assert.equal(await assignmentsOf().then((r) => r.length), 1);
  });

  it("B4. ORDER_UPDATED idempotente: reenvío del mismo evento tras asignar no vuelve a asignar", async () => {
    await seedCoil({ metros: "1500.00" });
    const payload1 = {
      eventId: "b3000000-0000-4000-8000-000000000001",
      pedidoId: "PED-B4",
      numeroPedidoCliente: "2600401",
      metros: 8000,
      bobinaMadre: 1200,
      camisa: "400",
      tipoMaterial: "OPP",
      micras: 30,
    };
    const first = await nexusCall(payload1);
    assert.equal(first.body.action, "ORDER_CREATED");

    await seedCoil({ metros: "4000.00" });
    const payload2 = {
      eventId: "b3000000-0000-4000-8000-000000000002",
      pedidoId: "PED-B4b",
      numeroPedidoCliente: "2600402",
      metros: 3000,
      bobinaMadre: 1200,
      camisa: "400",
      tipoMaterial: "OPP",
      micras: 30,
    };
    const second = await nexusCall(payload2);
    assert.equal(second.body.action, "ORDER_UPDATED");
    // Reenvío del segundo evento
    const retry = await nexusCall(payload2);
    assert.equal(retry.body.action, "ALREADY_PROCESSED");
    assert.equal(await assignmentsOf().then((r) => r.length), 2);
  });

  // =========================================================================
  // CONCURRENCIA
  // =========================================================================

  it("C1. Dos órdenes concurrentes no obtienen la misma bobina", async () => {
    await seedCoil({ metros: "30000.00" });
    const orderBody = {
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 10000,
    };
    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: sessionCookie },
        body: JSON.stringify(orderBody),
      }),
      fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: sessionCookie },
        body: JSON.stringify(orderBody),
      }),
    ]);
    assert.equal(resA.status, 201);
    assert.equal(resB.status, 201);
    const bodyA = (await resA.json()) as any;
    const bodyB = (await resB.json()) as any;

    const assignments = await assignmentsOf();
    assert.equal(assignments.length, 1, "una única asignación para la bobina");
    assert.equal(
      new Set(assignments.map((a) => a.coil_id)).size,
      assignments.length,
    );
    const covered = [bodyA, bodyB]
      .filter((o) => o.metrosFabricados > 0)
      .map((o) => o.id);
    assert.equal(covered.length, 1, "solo una orden cubierta");
    assert.equal(covered[0], assignments[0].orden_id);
  });

  it("C2. Constraint físico: la misma bobina no puede tener dos asignaciones", async () => {
    await seedCoil({});
    await pool.query(
      `INSERT INTO production_orders (ancho, micras, camisa, material, metros_necesarios, estado, origen)
       VALUES ('1200.00','30.00','400','OPP','9000.00','ACTIVA','MANUAL') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO production_order_coil_assignments (coil_id, orden_id, metros, origen)
       VALUES (1, 1, 5000.00, 'AUTO_STOCK')`,
    );
    await assert.rejects(
      async () => {
        await pool.query(
          `INSERT INTO production_order_coil_assignments (coil_id, orden_id, metros, origen)
           VALUES (1, 1, 5000.00, 'AUTO_STOCK')`,
        );
      },
      (err: any) => err.code === "23505",
      "UNIQUE(coil_id) enforced by PostgreSQL",
    );
  });

  // =========================================================================
  // PROGRESO DE ÓRDENES Y TRAZABILIDAD
  // =========================================================================

  it("D1. El progreso de la orden combina fabricadas (BOBINA) y asignadas (RESTO) sin contar dos veces", async () => {
    const originOrder = await pool.query(
      `INSERT INTO production_orders (ancho, micras, camisa, material, metros_necesarios, estado, origen)
       VALUES ('1200.00','30.00','400','OPP','20000.00','ACTIVA','MANUAL') RETURNING id`,
    );
    const originOrderId = originOrder.rows[0].id as number;
    // Bobina fabricada para la orden original (fabricado directo de esa orden)
    const fabricatedCoil = await seedCoil({
      tipo: "BOBINA",
      metros: "2000.00",
      orden_id: originOrderId,
    });

    // Resto de almacén compatible: candidato para la nueva orden
    const restoCoil = await seedCoil({ metros: "3000.00" });
    const { body: newOrder } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 5000,
    });

    // La nueva orden solo asigna el resto (la BOBINA fabricada no es candidata)
    const assignments = await assignmentsOf(newOrder.id);
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].coil_id, restoCoil);
    assert.equal(newOrder.metrosFabricados, 3000);
    assert.equal(newOrder.metrosPendientes, 2000);

    // La bobina fabricada sigue ligada a su orden original, sin asignación
    const coilRes = await pool.query(
      "SELECT orden_id FROM coils WHERE id = $1",
      [fabricatedCoil],
    );
    assert.equal(coilRes.rows[0].orden_id, originOrderId);

    // Progreso combinado: cada bobina cuenta una sola vez y para su orden
    const ordersRes = await fetch(`${baseUrl}/api/orders`, {
      headers: { Cookie: sessionCookie },
    });
    const orders = (await ordersRes.json()) as any[];
    const origin = orders.find((o) => o.id === originOrderId);
    assert.equal(origin.metrosFabricados, 2000, "la orden original conserva su fabricado");
    const created = orders.find((o) => o.id === newOrder.id);
    assert.equal(created.metrosFabricados, 3000, "la nueva orden solo cuenta el resto asignado");
  });

  it("D2. GET /orders/:id/coils incluye bobinas asignadas desde stock", async () => {
    await seedCoil({ metros: "4500.00" });
    const { body } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 4000,
    });
    const res = await fetch(`${baseUrl}/api/orders/${body.id}/coils`, {
      headers: { Cookie: sessionCookie },
    });
    const coils = (await res.json()) as any[];
    assert.equal(coils.length, 1);
    assert.ok(coils[0].asignacion);
    assert.equal(coils[0].asignacion.ordenId, body.id);
    assert.equal(coils[0].ordenId, null);
  });

  it("D3. DELETE de la orden libera las asignaciones (cascade) sin borrar bobinas", async () => {
    const coilId = await seedCoil({ metros: "4500.00" });
    // La orden queda ACTIVA (el stock no cubre toda la necesidad)
    const { body } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 8000,
    });
    const delRes = await fetch(`${baseUrl}/api/orders/${body.id}`, {
      method: "DELETE",
      headers: { Cookie: sessionCookie },
    });
    assert.equal(delRes.status, 204);
    const assignments = await assignmentsOf();
    assert.equal(assignments.length, 0);
    const coilRes = await pool.query(
      "SELECT estado FROM coils WHERE id = $1",
      [coilId],
    );
    assert.equal(coilRes.rows.length, 1, "la bobina sigue existiendo");
    assert.equal(coilRes.rows[0].estado, "DISPONIBLE");
  });

  // =========================================================================
  // EDICIÓN DE MATERIAL DE UNA BOBINA
  // =========================================================================

  it("E1. PATCH material: actualiza una bobina individual con trim y responde la bobina", async () => {
    const coilId = await seedCoil({ material: "OPP" });
    await seedCoil({ material: "OPP" }); // hermana del mismo grupo: no debe cambiar
    const res = await fetch(`${baseUrl}/api/inventory/${coilId}/material`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify({ material: "  opp reciclado  " }),
    });
    assert.equal(res.status, 200);
    const coil = (await res.json()) as any;
    assert.equal(coil.material, "opp reciclado");

    const rows = await pool.query("SELECT material FROM coils ORDER BY id");
    assert.equal(rows.rows[0].material, "opp reciclado");
    assert.equal(rows.rows[1].material, "OPP", "la bobina hermana no cambia");
  });

  it("E2. PATCH material: valor vacío → 400", async () => {
    const coilId = await seedCoil({});
    const res = await fetch(`${baseUrl}/api/inventory/${coilId}/material`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify({ material: "   " }),
    });
    assert.ok([400, 409].includes(res.status), `status ${res.status}`);
    // Con minLength=1 el schema zod rechaza "   " como 400
    assert.equal(res.status, 400);
  });

  it("E3. PATCH material: sin sesión → 401 y con usuario no admin → 403", async () => {
    const coilId = await seedCoil({});
    const noSession = await fetch(
      `${baseUrl}/api/inventory/${coilId}/material`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material: "OPP" }),
      },
    );
    assert.equal(noSession.status, 401);

    // Create a non-admin user and sign in
    const createUserRes = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify({
        nombre: "Operario",
        email: "operario@pigmea.test",
        password: "OperarioPassword123!",
        role: "USER",
      }),
    });
    assert.equal(createUserRes.status, 201);
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "operario@pigmea.test",
        password: "OperarioPassword123!",
      }),
    });
    const userCookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];
    const userRes = await fetch(
      `${baseUrl}/api/inventory/${coilId}/material`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: userCookie },
        body: JSON.stringify({ material: "OPP" }),
      },
    );
    assert.equal(userRes.status, 403);
  });

  it("E4. PATCH material: bobina EN FÁBRICA → 409", async () => {
    const coilId = await seedCoil({ estado: "EN FÁBRICA" });
    const res = await fetch(`${baseUrl}/api/inventory/${coilId}/material`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify({ material: "OPP" }),
    });
    assert.equal(res.status, 409);
    const body = (await res.json()) as any;
    assert.equal(body.code, "COIL_NOT_AVAILABLE");
  });

  it("E5. PATCH material: bobina asignada a una orden → 409", async () => {
    await seedCoil({ metros: "4500.00" });
    await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 4000,
    });
    const res = await fetch(`${baseUrl}/api/inventory/1/material`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify({ material: "OTRO" }),
    });
    assert.equal(res.status, 409);
    const body = (await res.json()) as any;
    assert.equal(body.code, "COIL_ASSIGNED_TO_ORDER");
    const coilRes = await pool.query("SELECT material FROM coils WHERE id = 1");
    assert.equal(coilRes.rows[0].material, "OPP", "material sin cambios");
  });

  it("E6. PATCH material: bobina inexistente → 404", async () => {
    const res = await fetch(`${baseUrl}/api/inventory/9999/material`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify({ material: "OPP" }),
    });
    assert.equal(res.status, 404);
  });

  it("E7. PATCH material: no altera las características de la orden de origen", async () => {
    const originOrder = await pool.query(
      `INSERT INTO production_orders (ancho, micras, camisa, material, metros_necesarios, estado, origen)
       VALUES ('1200.00','30.00','400','OPP','20000.00','ACTIVA','MANUAL') RETURNING id`,
    );
    const originOrderId = originOrder.rows[0].id as number;
    const coilId = await seedCoil({ orden_id: originOrderId });
    await fetch(`${baseUrl}/api/inventory/${coilId}/material`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify({ material: "OPP RECICLADO" }),
    });
    const orderRes = await pool.query(
      "SELECT material FROM production_orders WHERE id = $1",
      [originOrderId],
    );
    assert.equal(orderRes.rows[0].material, "OPP", "la orden no se modifica");
  });

  // =========================================================================
  // REGRESIÓN: FABRICADA / RESTO / CONSUMIR / RESTAURAR / BLOQUEO
  // =========================================================================

  it("F1. Regresión: Bobina fabricada sigue funcionando y finaliza la orden", async () => {
    const { body: order } = await createOrder({
      ancho: 1200,
      micras: 30,
      camisa: 400,
      material: "OPP",
      metrosNecesarios: 1000,
    });
    // Bloquear para el flujo habitual de fábrica
    await fetch(`${baseUrl}/api/orders/${order.id}/blocked`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify({ blocked: true }),
    });
    const res = await fetch(`${baseUrl}/api/inventory/coils`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify({ ordenId: order.id, metros: 1200 }),
    });
    assert.equal(res.status, 201);
    const ordersRes = await fetch(`${baseUrl}/api/orders`, {
      headers: { Cookie: sessionCookie },
    });
    const orders = (await ordersRes.json()) as any[];
    const updated = orders.find((o) => o.id === order.id);
    assert.equal(updated.estado, "FINALIZADA");
    assert.equal(updated.metrosFabricados, 1200);
  });

  it("F2. Regresión: Añadir resto + enviar a fábrica + devolver", async () => {
    const remRes = await fetch(`${baseUrl}/api/inventory/remnants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify({
        ancho: 1000,
        micras: 25,
        camisa: "475",
        material: "OPP",
        metros: 800,
      }),
    });
    assert.equal(remRes.status, 201);
    const remnant = (await remRes.json()) as any;

    const consumeRes = await fetch(
      `${baseUrl}/api/inventory/${remnant.id}/consume`,
      { method: "POST", headers: { Cookie: sessionCookie } },
    );
    assert.equal(consumeRes.status, 200);
    const consumed = (await consumeRes.json()) as any;
    assert.equal(consumed.estado, "EN FÁBRICA");

    const restoreRes = await fetch(
      `${baseUrl}/api/inventory/${remnant.id}/restore`,
      { method: "POST", headers: { Cookie: sessionCookie } },
    );
    assert.equal(restoreRes.status, 200);
    const restored = (await restoreRes.json()) as any;
    assert.equal(restored.estado, "DISPONIBLE");
  });

  it("F3. Regresión: bloquear/desbloquear y pedidos relacionados de NEXUS intactos", async () => {
    const { body } = await nexusCall({
      eventId: "f3000000-0000-4000-8000-000000000001",
      pedidoId: "PED-F3",
      numeroPedidoCliente: "2600901",
      metros: 3000,
      bobinaMadre: 1200,
      camisa: "400",
      tipoMaterial: "OPP",
      micras: 30,
    });
    assert.equal(body.action, "ORDER_CREATED");

    const blockRes = await fetch(`${baseUrl}/api/orders/${body.orderId}/blocked`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify({ blocked: true }),
    });
    assert.equal(blockRes.status, 200);
    const blockedOrder = (await blockRes.json()) as any;
    assert.equal(blockedOrder.estado, "BLOQUEADA");
    assert.equal(blockedOrder.pedidosRelacionados.length, 1);
    assert.equal(
      blockedOrder.pedidosRelacionados[0].numeroPedidoCliente,
      "2600901",
      "pedidosRelacionados intactos",
    );

    const unblockRes = await fetch(
      `${baseUrl}/api/orders/${body.orderId}/blocked`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: sessionCookie },
        body: JSON.stringify({ blocked: false }),
      },
    );
    assert.equal(unblockRes.status, 200);
  });
});
