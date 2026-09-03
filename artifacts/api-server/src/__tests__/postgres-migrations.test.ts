import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

import { fileURLToPath } from "node:url";

const { Pool, Client } = pg;
const TEST_DB_BASE_URL = "postgresql://postgres:test@localhost:5439";
const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../../../lib/db/drizzle", import.meta.url),
);

describe("Validación de Migraciones contra PostgreSQL Real", () => {
  let adminClient: pg.Client;

  before(async () => {
    adminClient = new Client({
      connectionString: `${TEST_DB_BASE_URL}/postgres`,
    });
    await adminClient.connect();
  });

  after(async () => {
    await adminClient.end();
  });

  it("Caso A — BD vacía: Aplica 0000 -> 0001 -> 0002 con migrator oficial", async () => {
    const dbName = "test_clean_migration_db";
    await adminClient.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminClient.query(`CREATE DATABASE ${dbName}`);

    const pool = new Pool({
      connectionString: `${TEST_DB_BASE_URL}/${dbName}`,
    });
    const db = drizzle(pool, { schema });

    // Execute official drizzle migrator on clean database
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    // Verify all 5 tables exist
    const tablesRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tables = tablesRes.rows.map((r) => r.table_name);
    assert.ok(
      tables.includes("production_orders"),
      "production_orders table exists",
    );
    assert.ok(
      tables.includes("production_order_pedidos"),
      "production_order_pedidos table exists",
    );
    assert.ok(tables.includes("coils"), "coils table exists");
    assert.ok(tables.includes("users"), "users table exists");
    assert.ok(tables.includes("auth_sessions"), "auth_sessions table exists");

    // Verify column origen in production_orders
    const columnsRes = await pool.query(`
      SELECT column_name, column_default, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'production_orders' AND column_name = 'origen'
    `);
    assert.equal(columnsRes.rows.length, 1);
    assert.equal(columnsRes.rows[0].column_name, "origen");
    assert.ok(columnsRes.rows[0].column_default.includes("MANUAL"));

    // Verify column nota in production_orders
    const notaColRes = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'production_orders' AND column_name = 'nota'
    `);
    assert.equal(notaColRes.rows.length, 1);
    assert.equal(notaColRes.rows[0].column_name, "nota");

    // Verify partial unique index exists
    const indexesRes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'production_orders' AND indexname = 'production_orders_gp_active_group_idx'
    `);
    assert.equal(indexesRes.rows.length, 1, "partial unique index exists");
    assert.ok(indexesRes.rows[0].indexdef.includes("UNIQUE INDEX"));
    assert.ok(indexesRes.rows[0].indexdef.includes("WHERE"));

    // Verify production_order_pedidos indexes & constraints
    const pedidosIndexesRes = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'production_order_pedidos'
    `);
    const pedidoIndexNames = pedidosIndexesRes.rows.map((r) => r.indexname);
    assert.ok(
      pedidoIndexNames.includes("production_order_pedidos_orden_id_idx"),
    );
    assert.ok(
      pedidoIndexNames.includes("production_order_pedidos_pedido_id_idx"),
    );

    await pool.end();
    await adminClient.query(`DROP DATABASE ${dbName}`);
  });

  it("Caso B — Upgrade de BD con datos preexistentes: Aplica 0000+0001 -> Inserta datos -> Aplica 0002", async () => {
    const dbName = "test_upgrade_migration_db";
    await adminClient.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminClient.query(`CREATE DATABASE ${dbName}`);

    const pool = new Pool({
      connectionString: `${TEST_DB_BASE_URL}/${dbName}`,
    });

    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const tempMigFolder = await fs.mkdtemp(
      path.join(os.tmpdir(), "drizzle-pre-phase2-"),
    );
    await fs.mkdir(path.join(tempMigFolder, "meta"));
    await fs.copyFile(
      path.join(MIGRATIONS_FOLDER, "0000_initial.sql"),
      path.join(tempMigFolder, "0000_initial.sql"),
    );
    await fs.copyFile(
      path.join(MIGRATIONS_FOLDER, "0001_users_and_sessions.sql"),
      path.join(tempMigFolder, "0001_users_and_sessions.sql"),
    );
    await fs.copyFile(
      path.join(MIGRATIONS_FOLDER, "meta", "0000_snapshot.json"),
      path.join(tempMigFolder, "meta", "0000_snapshot.json"),
    );
    await fs.copyFile(
      path.join(MIGRATIONS_FOLDER, "meta", "0001_snapshot.json"),
      path.join(tempMigFolder, "meta", "0001_snapshot.json"),
    );

    // Write journal with only entries 0 and 1
    const journal01 = {
      version: "7",
      dialect: "postgresql",
      entries: [
        {
          idx: 0,
          version: "7",
          when: 1787581993089,
          tag: "0000_initial",
          breakpoints: true,
        },
        {
          idx: 1,
          version: "7",
          when: 1787660000000,
          tag: "0001_users_and_sessions",
          breakpoints: true,
        },
      ],
    };
    await fs.writeFile(
      path.join(tempMigFolder, "meta", "_journal.json"),
      JSON.stringify(journal01, null, 2),
    );

    // Run official migrator with pre-Phase 2 migrations (0000 + 0001)
    const dbPre = drizzle(pool, { schema });
    await migrate(dbPre, { migrationsFolder: tempMigFolder });

    // 2. Insert pre-existing production-like data (orders with ACTIVA, BLOQUEADA, FINALIZADA)
    await pool.query(`
      INSERT INTO "production_orders" ("id", "ancho", "micras", "camisa", "material", "metros_necesarios", "estado", "creado_en", "finalizada_en")
      VALUES
        (1, '1200.00', '30.00', '400', 'OPP', '10000.00', 'ACTIVA', now(), NULL),
        (2, '1250.00', '35.00', '475', 'OPP RECICLADO', '15000.00', 'BLOQUEADA', now(), NULL),
        (3, '1000.00', '25.00', '520', 'OPP', '8000.00', 'FINALIZADA', now(), now());
    `);
    await pool.query(`
      INSERT INTO "coils" ("id", "tipo", "metros", "ancho", "micras", "camisa", "material", "estado", "orden_id", "creado_en")
      VALUES
        (1, 'BOBINA', '5000.00', '1200.00', '30.00', '400', 'OPP', 'DISPONIBLE', 1, now()),
        (2, 'BOBINA', '8000.00', '1000.00', '25.00', '520', 'OPP', 'DISPONIBLE', 3, now());
    `);

    // 3. Now run the official migrator to apply 0002_nexus_orders_integration.sql
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    // 4. Verify data integrity after migration:
    const ordersRes = await pool.query(
      `SELECT * FROM "production_orders" ORDER BY "id" ASC`,
    );
    assert.equal(ordersRes.rows.length, 3, "All 3 existing orders preserved");

    // Check order 1
    const order1 = ordersRes.rows.find((r) => r.id === 1);
    assert.ok(order1);
    assert.equal(order1.ancho, "1200.00");
    assert.equal(order1.micras, "30.00");
    assert.equal(order1.camisa, "400");
    assert.equal(order1.material, "OPP");
    assert.equal(order1.metros_necesarios, "10000.00");
    assert.equal(order1.estado, "ACTIVA");
    assert.equal(
      order1.origen,
      "MANUAL",
      "Pre-existing order has origen='MANUAL'",
    );

    // Check order 2
    const order2 = ordersRes.rows.find((r) => r.id === 2);
    assert.ok(order2);
    assert.equal(order2.estado, "BLOQUEADA");
    assert.equal(order2.origen, "MANUAL");

    // Check order 3
    const order3 = ordersRes.rows.find((r) => r.id === 3);
    assert.ok(order3);
    assert.equal(order3.estado, "FINALIZADA");
    assert.equal(order3.origen, "MANUAL");

    // Check coils
    const coilsRes = await pool.query(
      `SELECT * FROM "coils" ORDER BY "id" ASC`,
    );
    assert.equal(coilsRes.rows.length, 2, "All 2 existing coils preserved");
    assert.equal(coilsRes.rows[0].orden_id, 1);
    assert.equal(coilsRes.rows[1].orden_id, 3);

    // Check new relation table is initially empty
    const relationsRes = await pool.query(
      `SELECT COUNT(*) as count FROM "production_order_pedidos"`,
    );
    assert.equal(
      Number(relationsRes.rows[0].count),
      0,
      "Relations table is clean and empty",
    );

    // Check partial unique index was created and is active
    const idxRes = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'production_orders' AND indexname = 'production_orders_gp_active_group_idx'
    `);
    assert.equal(
      idxRes.rows.length,
      1,
      "Partial unique index active on upgraded database",
    );

    await pool.end();
    await adminClient.query(`DROP DATABASE ${dbName}`);
  });
});
