import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { processDataJob } from "./data-jobs.js";

const suite = process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;
suite("asynchronous data jobs", () => {
  const database = new Pool({ connectionString: process.env.DATABASE_URL });
  const userId = randomUUID();
  const programId = randomUUID();
  const schoolId = randomUUID();

  beforeAll(async () => {
    await database.query(
      `INSERT INTO users(id,email,password_hash,status) VALUES($1,$2,'x','ACTIVE')`,
      [userId, `${userId}@test.local`],
    );
    await database.query(
      `INSERT INTO schools(id,code,name) VALUES($1,$2,'Integration School')`,
      [schoolId, `S${Date.now()}`],
    );
    await database.query(
      `INSERT INTO programs(id,code,name,workflow_type) VALUES($1,$2,'Integration Program','ONE_LEVEL')`,
      [programId, `P${Date.now()}`],
    );
  });
  afterAll(async () => database.end());

  it("validates, confirms and exports scoped student data", async () => {
    const importId = randomUUID();
    const code = `IMP${Date.now()}`;
    const rows = [
      {
        student_code: code,
        full_name: "Import Student",
        date_of_birth: "2010-01-01",
        program_id: programId,
        current_school_id: schoolId,
        grade_level_current: 10,
      },
    ];
    await database.query(
      `INSERT INTO data_jobs(id,kind,resource_type,requested_by,school_scope_ids,source_rows,status,idempotency_key,request_hash) VALUES($1,'IMPORT','STUDENTS',$2,$3,$4,'QUEUED','validate',$5)`,
      [importId, userId, [schoolId], JSON.stringify(rows), "a".repeat(64)],
    );
    await processDataJob(database, "data.import.validate", importId);
    expect(
      (
        await database.query(`SELECT status FROM data_jobs WHERE id=$1`, [
          importId,
        ])
      ).rows[0].status,
    ).toBe("VALIDATED");
    await database.query(
      `UPDATE data_jobs SET status='QUEUED',confirmed_by=$2,confirmed_at=now() WHERE id=$1`,
      [importId, userId],
    );
    await processDataJob(database, "data.import.confirmed", importId);
    expect(
      (
        await database.query(
          `SELECT status,result_summary FROM data_jobs WHERE id=$1`,
          [importId],
        )
      ).rows[0],
    ).toMatchObject({
      status: "COMPLETED",
      result_summary: { imported_count: 1 },
    });

    const exportId = randomUUID();
    await database.query(
      `INSERT INTO data_jobs(id,kind,resource_type,requested_by,school_scope_ids,parameters,status,idempotency_key,request_hash) VALUES($1,'EXPORT','STUDENTS',$2,$3,'{}','QUEUED','export',$4)`,
      [exportId, userId, [schoolId], "b".repeat(64)],
    );
    await processDataJob(database, "data.export.requested", exportId);
    expect(
      (
        await database.query(
          `SELECT status,result_summary,result_object_key FROM data_jobs WHERE id=$1`,
          [exportId],
        )
      ).rows[0],
    ).toMatchObject({
      status: "COMPLETED",
      result_summary: { row_count: 1 },
      result_object_key: `private/exports/${exportId}.csv`,
    });
  });
});
