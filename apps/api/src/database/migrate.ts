import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@vnsf/config";
import { Pool, type PoolClient } from "pg";

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../infra/docker/postgres",
);

async function applyMigration(client: PoolClient, name: string, sql: string) {
  const checksum = createHash("sha256").update(sql).digest("hex");
  const existing = await client.query<{ checksum: string }>(
    "SELECT checksum FROM schema_migrations WHERE name=$1",
    [name],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].checksum !== checksum)
      throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${name}`);
    return false;
  }
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
      [name, checksum],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const pool = new Pool({
    connectionString: loadConfig().DATABASE_URL,
    max: 1,
  });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [867_763_001]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(migrationsDirectory))
      .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    if (files.length === 0) throw new Error("NO_MIGRATIONS_FOUND");
    for (const name of files) {
      const applied = await applyMigration(
        client,
        name,
        await readFile(path.join(migrationsDirectory, name), "utf8"),
      );
      process.stdout.write(`${applied ? "applied" : "verified"} ${name}\n`);
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [867_763_001])
      .catch(() => undefined);
    client.release();
    await pool.end();
  }
}

await main();
