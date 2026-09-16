import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import pg from "pg";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:test@localhost:5439/control_bobinas_order_events_test";
process.env.GESTION_PEDIDOS_INTEGRATION_TOKEN =
  "test-secret-nexus-token-xyz-123456";

const { Client } = pg;
const TEST_DB_URL = process.env.DATABASE_URL;
const NEXUS_TOKEN = process.env.GESTION_PEDIDOS_INTEGRATION_TOKEN;

interface OrderEvent {
  id: number;
  ordenId: number;
  usuarioId: number | null;
  usuarioNombre: string | null;
  accion: string;
  detalle: string | null;
  creadoEn: string;
}

describe("Auditoría de órdenes, reapertura y confirmación de metros contra PostgreSQL real", () => {
  let adminClient: pg.Client;
  let pool: pg.Pool;
  let server: http.Server;
  let baseUrl: string;
  let sessionCookie: string;

  const api = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${baseUrl}/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    return { status: res.status, body };
  };

  /** Orden bloqueada con `fabricados` m registrados sobre `necesarios` m. */
  const blockedOrderWithDeficit = async (
    necesarios: number,
    fabricados: number,
  ): Promise<number> => {
    const { body: order } = await api("/orders", {
      method: "POST",
      body: JSON.stringify({
        ancho: 1200,
        micras: 30,
        camisa: 400,
        material: "OPP",
        metrosNecesarios: necesarios,
      }),
    });
    if (fabricados > 0) {
      await api("/inventory/coils", {
        method: "POST",
        body: JSON.stringify({ ordenId: order.id, metros: fabricados }),
      });
    }
    await api(`/orders/${order.id}/blocked`, {
      method: "PATCH",
      body: JSON.stringify({ blocked: true }),
    });
    return order.id as number;
  };

  /**
   * Orden BLOQUEADA ya cubierta al 100%: por API se autofinalizaría al
   * registrar la bobina, así que se siembra directamente en PostgreSQL.
   */
  const seedBlockedCoveredOrder = async (metros: number): Promise<number> => {
    const order = await pool.query(
      `INSERT INTO production_orders (ancho, micras, camisa, material, metros_necesarios, estado, origen)
       VALUES ('1200.00', '30.00', '400', 'OPP', $1, 'BLOQUEADA', 'MANUAL') RETURNING id`,
      [metros.toFixed(2)],
    );
    const orderId = order.rows[0].id as number;
    await pool.query(
      `INSERT INTO coils (tipo, metros, ancho, micras, camisa, material, estado, orden_id)
       VALUES ('BOBINA', $1, '1200.00', '30.00', '400', 'OPP', 'DISPONIBLE', $2)`,
      [metros.toFixed(2), orderId],
    );
    return orderId;
  };

  const eventsOf = async (orderId: number): Promise<OrderEvent[]> => {
    const { status, body } = await api(`/orders/${orderId}/events`);
    assert.equal(status, 200);
    return body as OrderEvent[];
  };

  before(async () => {
    adminClient = new Client({
      connectionString: "postgresql://postgres:test@localhost:5439/postgres",
    });
    await adminClient.connect();
    await adminClient.query(
      "DROP DATABASE IF EXISTS control_bobinas_order_events_test",
    );
    await adminClient.query("CREATE DATABASE control_bobinas_order_events_test");

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
    assert.ok(TEST_DB_URL);
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
        "DROP DATABASE IF EXISTS control_bobinas_order_events_test",
      );
      await adminClient.end();
    }
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE TABLE production_order_events, production_order_coil_assignments, production_order_pedidos, coils, production_orders RESTART IDENTITY CASCADE",
    );
  });

  // =========================================================================
  // FINALIZACIÓN MANUAL: CONFIRMAR SOLO CUANDO EL DATO HA CAMBIADO
  // =========================================================================

  it("F1. Finaliza a la primera cuando los metros faltantes coinciden con los que vio el operario", async () => {
    const orderId = await blockedOrderWithDeficit(5000, 2000);

    const { status, body } = await api(`/orders/${orderId}/finalize`, {
      method: "POST",
      body: JSON.stringify({
        nota: "Finalizada manualmente con 3.000 m faltantes",
        faltantesEsperados: 3000,
      }),
    });

    assert.equal(status, 200);
    assert.equal(body.estado, "FINALIZADA");
    assert.equal(body.metrosPendientes, 3000);
  });

  it("F2. Metros faltantes desfasados → 409 con el dato fresco y sin finalizar", async () => {
    const orderId = await blockedOrderWithDeficit(5000, 2000);

    const { status, body } = await api(`/orders/${orderId}/finalize`, {
      method: "POST",
      body: JSON.stringify({ nota: "Nota", faltantesEsperados: 5000 }),
    });

    assert.equal(status, 409);
    assert.equal(body.code, "FINALIZE_METERS_DEFICIT");
    assert.equal(body.faltantes, 3000);

    const row = await pool.query(
      "SELECT estado, finalizada_en FROM production_orders WHERE id = $1",
      [orderId],
    );
    assert.equal(row.rows[0].estado, "BLOQUEADA");
    assert.equal(row.rows[0].finalizada_en, null);
    assert.equal((await eventsOf(orderId)).length, 1, "solo el bloqueo");
  });

  it("F3. Tras el 409, confirmar con forzar finaliza la orden", async () => {
    const orderId = await blockedOrderWithDeficit(5000, 2000);

    const rechazo = await api(`/orders/${orderId}/finalize`, {
      method: "POST",
      body: JSON.stringify({ nota: "Nota", faltantesEsperados: 5000 }),
    });
    assert.equal(rechazo.status, 409);

    const { status, body } = await api(`/orders/${orderId}/finalize`, {
      method: "POST",
      body: JSON.stringify({
        nota: "Finalizada manualmente con 3.000 m faltantes",
        faltantesEsperados: rechazo.body.faltantes,
        forzar: true,
      }),
    });

    assert.equal(status, 200);
    assert.equal(body.estado, "FINALIZADA");
  });

  it("F4. Sin faltantesEsperados se sigue pidiendo confirmación", async () => {
    const orderId = await blockedOrderWithDeficit(5000, 2000);

    const { status, body } = await api(`/orders/${orderId}/finalize`, {
      method: "POST",
      body: JSON.stringify({ nota: "Nota" }),
    });

    assert.equal(status, 409);
    assert.equal(body.code, "FINALIZE_METERS_DEFICIT");
  });

  it("F5. Sin metros faltantes finaliza sin confirmación adicional", async () => {
    const orderId = await seedBlockedCoveredOrder(2000);

    const { status, body } = await api(`/orders/${orderId}/finalize`, {
      method: "POST",
      body: JSON.stringify({ nota: "Cerrada" }),
    });

    assert.equal(status, 200);
    assert.equal(body.estado, "FINALIZADA");
  });

  // =========================================================================
  // REAPERTURA
  // =========================================================================

  it("R1. Reabrir devuelve la orden a BLOQUEADA conservando la nota de finalización", async () => {
    const orderId = await blockedOrderWithDeficit(5000, 2000);
    await api(`/orders/${orderId}/finalize`, {
      method: "POST",
      body: JSON.stringify({ faltantesEsperados: 3000 }),
    });

    const { status, body } = await api(`/orders/${orderId}/reopen`, {
      method: "POST",
      body: JSON.stringify({ motivo: "Pedido agrupado tras finalizar" }),
    });

    assert.equal(status, 200);
    assert.equal(body.estado, "BLOQUEADA");
    assert.equal(body.finalizadaEn, null);
    // es-ES no separa millares en cifras de cuatro dígitos: 3000, no 3.000
    assert.match(body.nota, /3000 m faltantes/);
    assert.match(body.nota, /Reabierta: Pedido agrupado tras finalizar/);

    const row = await pool.query(
      "SELECT estado, finalizada_en FROM production_orders WHERE id = $1",
      [orderId],
    );
    assert.equal(row.rows[0].estado, "BLOQUEADA");
    assert.equal(row.rows[0].finalizada_en, null);
  });

  it("R2. Reabrir una orden que no está finalizada → 400", async () => {
    const orderId = await blockedOrderWithDeficit(5000, 2000);

    const { status } = await api(`/orders/${orderId}/reopen`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    assert.equal(status, 400);
  });

  it("R3. Reabrir una orden inexistente → 404", async () => {
    const { status } = await api("/orders/999999/reopen", {
      method: "POST",
      body: JSON.stringify({}),
    });

    assert.equal(status, 404);
  });

  it("R4. La orden reabierta sale del historial y vuelve al listado de bloqueadas", async () => {
    const orderId = await blockedOrderWithDeficit(5000, 2000);
    await api(`/orders/${orderId}/finalize`, {
      method: "POST",
      body: JSON.stringify({ faltantesEsperados: 3000 }),
    });
    await api(`/orders/${orderId}/reopen`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    const finalizadas = await api("/orders?status=FINALIZADA");
    const bloqueadas = await api("/orders?status=BLOQUEADA");

    assert.deepEqual(
      finalizadas.body.map((o: any) => o.id),
      [],
    );
    assert.deepEqual(
      bloqueadas.body.map((o: any) => o.id),
      [orderId],
    );
  });

  // =========================================================================
  // HISTORIAL DE EVENTOS
  // =========================================================================

  it("E1. Bloquear, desbloquear, finalizar y reabrir dejan traza con usuario y en orden descendente", async () => {
    const orderId = await blockedOrderWithDeficit(5000, 2000);
    await api(`/orders/${orderId}/blocked`, {
      method: "PATCH",
      body: JSON.stringify({ blocked: false }),
    });
    await api(`/orders/${orderId}/blocked`, {
      method: "PATCH",
      body: JSON.stringify({ blocked: true }),
    });
    await api(`/orders/${orderId}/finalize`, {
      method: "POST",
      body: JSON.stringify({ faltantesEsperados: 3000 }),
    });
    await api(`/orders/${orderId}/reopen`, {
      method: "POST",
      body: JSON.stringify({ motivo: "Error al cerrar" }),
    });

    const events = await eventsOf(orderId);

    assert.deepEqual(
      events.map((e) => e.accion),
      [
        "REABIERTA",
        "FINALIZADA_MANUAL",
        "BLOQUEADA",
        "DESBLOQUEADA",
        "BLOQUEADA",
      ],
    );
    for (const event of events) {
      assert.equal(event.ordenId, orderId);
      assert.equal(event.usuarioNombre, "Admin Pigmea");
      assert.ok(event.usuarioId !== null);
    }
    assert.equal(events[0].detalle, "Error al cerrar");
    assert.match(events[1].detalle ?? "", /3000 m faltantes/);
  });

  it("E2. La autofinalización al cubrir los metros queda registrada", async () => {
    const { body: order } = await api("/orders", {
      method: "POST",
      body: JSON.stringify({
        ancho: 1200,
        micras: 30,
        camisa: 400,
        material: "OPP",
        metrosNecesarios: 1000,
      }),
    });
    await api("/inventory/coils", {
      method: "POST",
      body: JSON.stringify({ ordenId: order.id, metros: 1000 }),
    });

    const events = await eventsOf(order.id);

    assert.deepEqual(
      events.map((e) => e.accion),
      ["FINALIZADA_AUTO"],
    );
  });

  it("E3. El pedido agrupado por Nexus queda registrado sin usuario", async () => {
    const nexusPayload = (overrides: Record<string, unknown>) => ({
      eventId: "a0000000-0000-4000-8000-000000000001",
      pedidoId: "PED-2026-001",
      numeroPedidoCliente: "2600101",
      metros: 5000,
      bobinaMadre: 1200,
      camisa: "400",
      tipoMaterial: "OPP",
      micras: 30,
      ...overrides,
    });
    const postNexus = (payload: Record<string, unknown>) =>
      fetch(`${baseUrl}/api/integrations/gestion-pedidos/nexus-orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${NEXUS_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });

    const first = await postNexus(nexusPayload({}));
    const created = (await first.json()) as { orderId: number };
    const second = await postNexus(
      nexusPayload({
        eventId: "b0000000-0000-4000-8000-000000000002",
        pedidoId: "PED-2026-002",
        numeroPedidoCliente: "2600102",
        metros: 7000,
      }),
    );
    assert.equal(second.status, 200);

    const events = await eventsOf(created.orderId);

    assert.deepEqual(
      events.map((e) => e.accion),
      ["PEDIDO_AGRUPADO"],
    );
    assert.equal(events[0].usuarioId, null);
    assert.equal(events[0].usuarioNombre, null);
    assert.match(events[0].detalle ?? "", /2600102/);
  });

  it("E4. El historial de una orden inexistente → 404", async () => {
    const { status } = await api("/orders/999999/events");

    assert.equal(status, 404);
  });

  it("E5. Al borrar la orden se borra su historial (cascade)", async () => {
    const orderId = await blockedOrderWithDeficit(5000, 0);
    assert.equal((await eventsOf(orderId)).length, 1);

    await api(`/orders/${orderId}/blocked`, {
      method: "PATCH",
      body: JSON.stringify({ blocked: false }),
    });
    const { status } = await api(`/orders/${orderId}`, { method: "DELETE" });
    assert.ok([200, 204].includes(status), `status ${status}`);

    const rows = await pool.query(
      "SELECT id FROM production_order_events WHERE orden_id = $1",
      [orderId],
    );
    assert.equal(rows.rows.length, 0);
  });
});
