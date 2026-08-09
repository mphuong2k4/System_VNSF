import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

if (process.env.DR_ALLOW_RESTORE !== "true") {
  throw new Error(
    "Set DR_ALLOW_RESTORE=true to run the isolated restore drill",
  );
}

const sourceDatabase = process.env.DR_SOURCE_DATABASE ?? "vnsf";
if (!/^[a-z][a-z0-9_]{0,62}$/.test(sourceDatabase)) {
  throw new Error("DR_SOURCE_DATABASE is invalid");
}
const restoreDatabase = `vnsf_restore_drill_${randomBytes(4).toString("hex")}`;
const runtimeDir = path.resolve(".runtime", "dr");
const backupPath = path.join(runtimeDir, `${restoreDatabase}.dump`);
await mkdir(runtimeDir, { recursive: true });

function docker(args, options = {}) {
  const result = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", ...args],
    {
      encoding: options.encoding ?? "utf8",
      input: options.input,
      maxBuffer: 128 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.toString() || `docker command failed: ${args.join(" ")}`,
    );
  }
  return result.stdout;
}

function scalar(database, sql) {
  return docker(["psql", "-U", "vnsf", "-d", database, "-Atqc", sql]).trim();
}

let created = false;
try {
  const dump = docker([
    "pg_dump",
    "-U",
    "vnsf",
    "-d",
    sourceDatabase,
    "--no-owner",
    "--no-acl",
  ]);
  await writeFile(backupPath, dump);
  docker(["createdb", "-U", "vnsf", restoreDatabase]);
  created = true;
  docker(
    ["psql", "-v", "ON_ERROR_STOP=1", "-U", "vnsf", "-d", restoreDatabase],
    {
      input: dump,
    },
  );
  const tableSql =
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'";
  const sourceTables = scalar(sourceDatabase, tableSql);
  const restoredTables = scalar(restoreDatabase, tableSql);
  const criticalSql =
    "SELECT count(*) FROM users UNION ALL SELECT count(*) FROM students UNION ALL SELECT count(*) FROM outbox_events UNION ALL SELECT count(*) FROM audit_events ORDER BY 1";
  const sourceCritical = scalar(sourceDatabase, criticalSql);
  const restoredCritical = scalar(restoreDatabase, criticalSql);
  if (sourceTables !== restoredTables || sourceCritical !== restoredCritical) {
    throw new Error("Restored database verification did not match the source");
  }
  console.log(
    JSON.stringify({
      source_database: sourceDatabase,
      restore_database: restoreDatabase,
      tables_verified: Number(sourceTables),
      critical_counts_verified: sourceCritical.split(/\r?\n/).map(Number),
      backup_bytes: dump.length,
    }),
  );
} finally {
  if (created) {
    docker(["dropdb", "-U", "vnsf", "--if-exists", restoreDatabase]);
  }
  await rm(backupPath, { force: true });
}
