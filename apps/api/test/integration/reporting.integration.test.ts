import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/database/database.service.js";
import type { ObjectStorageService } from "../../src/modules/documents/object-storage.service.js";
import type { AuthContext } from "../../src/modules/identity/session.guard.js";
import { ReportingService } from "../../src/modules/reporting/reporting.service.js";

const suite = process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;
suite("scoped reporting and data jobs", () => {
  const userId = randomUUID();
  const schoolId = randomUUID();
  const otherSchoolId = randomUUID();
  let db: DatabaseService;
  let service: ReportingService;
  const auth: AuthContext = {
    sessionId: randomUUID(),
    userId,
    roles: ["SCHOOL_MANAGER"],
    schoolIds: [schoolId],
    mfaVerified: true,
  };

  beforeAll(async () => {
    db = new DatabaseService();
    service = new ReportingService(db, {
      downloadUrl: (key: string) => Promise.resolve(`signed:${key}`),
    } as ObjectStorageService);
    await db.query(
      `INSERT INTO users(id,email,password_hash,status) VALUES($1,$2,'x','ACTIVE')`,
      [userId, `${userId}@test.local`],
    );
    await db.query(
      `INSERT INTO schools(id,code,name) VALUES($1,$2,'Scoped'),($3,$4,'Hidden')`,
      [schoolId, `R${Date.now()}`, otherSchoolId, `H${Date.now()}`],
    );
  });
  afterAll(async () => db.onModuleDestroy());

  it("limits summaries and export jobs to the manager school scope", async () => {
    const summary = await service.summary(auth);
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ school_id: schoolId });
    await expect(service.summary(auth, otherSchoolId)).rejects.toThrow(
      "RESOURCE_NOT_FOUND",
    );
    const job = await service.createExport(auth, randomUUID(), {
      resource_type: "STUDENTS",
    });
    expect(job).toMatchObject({ kind: "EXPORT", status: "QUEUED" });
    expect(await service.listJobs(auth)).toHaveLength(1);
  });

  it("rejects import rows outside the manager school scope", async () => {
    await expect(
      service.createStudentImport(auth, randomUUID(), {
        rows: [
          {
            student_code: "X01",
            full_name: "Hidden Student",
            date_of_birth: "2010-01-01",
            program_id: randomUUID(),
            current_school_id: otherSchoolId,
            grade_level_current: 10,
          },
        ],
      }),
    ).rejects.toThrow("RESOURCE_NOT_FOUND");
  });
});
