import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { loadConfig } from "@vnsf/config";
import type { Pool, PoolClient } from "pg";

type StudentRow = {
  student_code: string;
  full_name: string;
  date_of_birth: string;
  program_id: string;
  current_school_id: string;
  grade_level_current?: number | null;
};
type Job = {
  id: string;
  kind: string;
  resource_type: string;
  school_scope_ids: string[];
  parameters: { school_id?: string };
  source_rows: StudentRow[] | null;
  status: string;
};

export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csv(headers: string[], rows: unknown[][]): string {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export async function processDataJob(
  database: Pool,
  event: string,
  jobId: string,
) {
  if (event === "data.export.requested") return exportData(database, jobId);
  if (event === "data.import.validate") return validateImport(database, jobId);
  if (event === "data.import.confirmed") return confirmImport(database, jobId);
  throw new Error("UNSUPPORTED_DATA_JOB_EVENT");
}

async function lock(
  database: Pool,
  id: string,
  expected: string[],
): Promise<{ client: PoolClient; job: Job } | null> {
  const client = await database.connect();
  await client.query("BEGIN");
  const result = await client.query<Job>(
    `SELECT * FROM data_jobs WHERE id=$1 FOR UPDATE`,
    [id],
  );
  const job = result.rows[0];
  if (!job || !expected.includes(job.status)) {
    await client.query("ROLLBACK");
    client.release();
    return null;
  }
  await client.query(
    `UPDATE data_jobs SET status='PROCESSING',started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=$1`,
    [id],
  );
  return { client, job };
}

async function exportData(database: Pool, id: string) {
  const locked = await lock(database, id, ["QUEUED"]);
  if (!locked) return;
  const { client, job } = locked;
  try {
    const scoped = job.school_scope_ids;
    let headers: string[];
    let rows: unknown[][];
    if (job.resource_type === "STUDENTS") {
      headers = [
        "student_code",
        "full_name",
        "date_of_birth",
        "school_code",
        "program_code",
        "grade",
        "status",
      ];
      const result = await client.query(
        `SELECT s.student_code,s.full_name,s.date_of_birth,sc.code school_code,p.code program_code,s.grade_level_current,s.status FROM students s JOIN schools sc ON sc.id=s.current_school_id JOIN programs p ON p.id=s.program_id WHERE (cardinality($1::uuid[])=0 OR s.current_school_id=ANY($1::uuid[])) ORDER BY s.student_code`,
        [scoped],
      );
      rows = result.rows.map((r) => Object.values(r));
    } else if (job.resource_type === "SUBMISSIONS") {
      headers = [
        "student_code",
        "period_code",
        "type",
        "status",
        "submitted_at",
      ];
      const result = await client.query(
        `SELECT s.student_code,p.code period_code,a.type,a.status,v.submitted_at FROM academic_submissions a JOIN students s ON s.id=a.student_id JOIN academic_periods p ON p.id=a.period_id LEFT JOIN LATERAL(SELECT submitted_at FROM submission_versions WHERE submission_id=a.id ORDER BY version_no DESC LIMIT 1)v ON true WHERE (cardinality($1::uuid[])=0 OR s.current_school_id=ANY($1::uuid[])) ORDER BY s.student_code,p.code`,
        [scoped],
      );
      rows = result.rows.map((r) => Object.values(r));
    } else {
      headers = [
        "student_code",
        "period_code",
        "transfer_type",
        "amount",
        "currency",
        "status",
        "transferred_at",
        "reference",
      ];
      const result = await client.query(
        `SELECT s.student_code,p.code period_code,m.transfer_type,m.amount,m.currency,m.status,m.transferred_at,m.reference FROM manual_transfers m JOIN students s ON s.id=m.student_id JOIN academic_periods p ON p.id=m.period_id WHERE (cardinality($1::uuid[])=0 OR s.current_school_id=ANY($1::uuid[])) ORDER BY m.created_at`,
        [scoped],
      );
      rows = result.rows.map((r) => Object.values(r));
    }
    const body = csv(headers, rows);
    const config = loadConfig();
    const storage = new S3Client({
      region: "us-east-1",
      endpoint: config.OBJECT_STORAGE_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY,
        secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY,
      },
    });
    const key = `private/exports/${job.id}.csv`;
    await storage.send(
      new PutObjectCommand({
        Bucket: config.OBJECT_STORAGE_BUCKET,
        Key: key,
        Body: Buffer.from(body),
        ContentType: "text/csv; charset=utf-8",
        ContentDisposition: `attachment; filename="vnsf-${job.resource_type.toLowerCase()}.csv"`,
      }),
    );
    await client.query(
      `UPDATE data_jobs SET status='COMPLETED',result_object_key=$2,result_summary=jsonb_build_object('row_count',$3::int),completed_at=now(),updated_at=now() WHERE id=$1`,
      [id, key, rows.length],
    );
    await client.query("COMMIT");
  } catch (error) {
    await fail(client, id, error);
    throw error;
  } finally {
    client.release();
  }
}

async function validateImport(database: Pool, id: string) {
  const locked = await lock(database, id, ["QUEUED"]);
  if (!locked) return;
  const { client, job } = locked;
  try {
    const rows = job.source_rows ?? [];
    const codes = rows.map((r) => r.student_code.toLowerCase());
    const duplicateRows = codes.filter(
      (code, index) => codes.indexOf(code) !== index,
    );
    const existing = await client.query<{ student_code: string }>(
      `SELECT student_code FROM students WHERE lower(student_code)=ANY($1::text[])`,
      [codes],
    );
    const programs = await client.query<{ id: string }>(
      `SELECT id FROM programs WHERE id=ANY($1::uuid[]) AND active`,
      [[...new Set(rows.map((r) => r.program_id))]],
    );
    const schools = await client.query<{ id: string }>(
      `SELECT id FROM schools WHERE id=ANY($1::uuid[]) AND active`,
      [[...new Set(rows.map((r) => r.current_school_id))]],
    );
    const allowed =
      job.school_scope_ids.length === 0 ||
      rows.every((r) => job.school_scope_ids.includes(r.current_school_id));
    const errors = [
      ...new Set([
        ...duplicateRows,
        ...existing.rows.map((r) => r.student_code.toLowerCase()),
      ]),
    ];
    if (programs.rowCount !== new Set(rows.map((r) => r.program_id)).size)
      errors.push("INVALID_PROGRAM");
    if (
      schools.rowCount !== new Set(rows.map((r) => r.current_school_id)).size ||
      !allowed
    )
      errors.push("INVALID_SCHOOL_SCOPE");
    await client.query(
      `UPDATE data_jobs SET status=$2::varchar,result_summary=jsonb_build_object('row_count',$3::int,'valid_count',$4::int,'errors',$5::jsonb),error_code=$6::varchar,completed_at=CASE WHEN $2::text='FAILED' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1`,
      [
        id,
        errors.length ? "FAILED" : "VALIDATED",
        rows.length,
        errors.length ? 0 : rows.length,
        JSON.stringify(errors),
        errors.length ? "IMPORT_VALIDATION_FAILED" : null,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await fail(client, id, error);
    throw error;
  } finally {
    client.release();
  }
}

async function confirmImport(database: Pool, id: string) {
  const locked = await lock(database, id, ["QUEUED"]);
  if (!locked) return;
  const { client, job } = locked;
  try {
    const rows = job.source_rows ?? [];
    for (const row of rows) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO students(student_code,full_name,date_of_birth,program_id,current_school_id,grade_level_current,status) VALUES($1,$2,$3,$4,$5,$6,'ACTIVE') RETURNING id`,
        [
          row.student_code,
          row.full_name,
          row.date_of_birth,
          row.program_id,
          row.current_school_id,
          row.grade_level_current ?? null,
        ],
      );
      await client.query(
        `INSERT INTO student_school_history(student_id,school_id,effective_from) VALUES($1,$2,CURRENT_DATE)`,
        [inserted.rows[0]!.id, row.current_school_id],
      );
    }
    await client.query(
      `UPDATE data_jobs SET status='COMPLETED',source_rows='[]'::jsonb,result_summary=jsonb_build_object('imported_count',$2::int),completed_at=now(),updated_at=now() WHERE id=$1`,
      [id, rows.length],
    );
    await client.query("COMMIT");
  } catch (error) {
    await fail(client, id, error);
    throw error;
  } finally {
    client.release();
  }
}

async function fail(client: PoolClient, id: string, error: unknown) {
  await client.query("ROLLBACK");
  await client.query(
    `UPDATE data_jobs SET status='FAILED',error_code='DATA_JOB_PROCESSING_FAILED',result_summary=jsonb_build_object('message',$2::text),completed_at=now(),updated_at=now() WHERE id=$1 AND status NOT IN('COMPLETED','CANCELLED')`,
    [id, error instanceof Error ? error.message.slice(0, 300) : "unknown"],
  );
}
