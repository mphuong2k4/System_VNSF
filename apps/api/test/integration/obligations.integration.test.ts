import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/database/database.service.js";
import type { AuthContext } from "../../src/modules/identity/session.guard.js";
import { ObligationsService } from "../../src/modules/obligations/obligations.service.js";

const suite = process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;

suite("extensions and thank-you persistence", () => {
  const ids = {
    school: randomUUID(),
    program: randomUUID(),
    period: randomUUID(),
    student: randomUUID(),
    studentUser: randomUUID(),
    schoolManager: randomUUID(),
    programManager: randomUUID(),
    submission: randomUUID(),
  };
  let db: DatabaseService;
  let service: ObligationsService;
  const student: AuthContext = {
    sessionId: randomUUID(),
    userId: ids.studentUser,
    roles: ["STUDENT"],
    schoolIds: [],
    studentId: ids.student,
    mfaVerified: true,
  };
  const schoolManager: AuthContext = {
    sessionId: randomUUID(),
    userId: ids.schoolManager,
    roles: ["SCHOOL_MANAGER"],
    schoolIds: [ids.school],
    mfaVerified: true,
  };
  const programManager: AuthContext = {
    sessionId: randomUUID(),
    userId: ids.programManager,
    roles: ["PROGRAM_MANAGER"],
    schoolIds: [],
    mfaVerified: true,
  };

  beforeAll(async () => {
    db = new DatabaseService();
    service = new ObligationsService(db);
    await db.query(
      `INSERT INTO users(id,email,password_hash,status) VALUES
       ($1,$2,'x','ACTIVE'),($3,$4,'x','ACTIVE'),($5,$6,'x','ACTIVE')`,
      [
        ids.studentUser,
        `${ids.studentUser}@test.local`,
        ids.schoolManager,
        `${ids.schoolManager}@test.local`,
        ids.programManager,
        `${ids.programManager}@test.local`,
      ],
    );
    await db.query(
      `INSERT INTO schools(id,code,name) VALUES($1,$2,'Workflow School')`,
      [ids.school, `S${ids.school.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO programs(id,code,name,workflow_type) VALUES($1,$2,'Workflow Program','ONE_LEVEL')`,
      [ids.program, `P${ids.program.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO academic_periods(id,program_id,code,due_at,workflow_type) VALUES($1,$2,$3,now()+interval '10 days','ONE_LEVEL')`,
      [ids.period, ids.program, `T${ids.period.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO students(id,student_code,full_name,date_of_birth,program_id,current_school_id,grade_level_current)
       VALUES($1,$2,'Workflow Student','2009-01-01',$3,$4,10)`,
      [ids.student, `H${ids.student.slice(0, 8)}`, ids.program, ids.school],
    );
    await db.query(
      `INSERT INTO academic_submissions(id,student_id,period_id,type,status,created_by,effective_due_at)
       VALUES($1,$2,$3,'TRANSCRIPT','DRAFT',$4,now()+interval '10 days')`,
      [ids.submission, ids.student, ids.period, ids.studentUser],
    );
  });
  afterAll(async () => db.onModuleDestroy());

  it("approves one open extension and updates the effective deadline", async () => {
    const requested = (await service.requestExtension(student, ids.submission, {
      reason: "Need additional time for the certified transcript",
      proposed_due_at: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    })) as { id: string; version: number };
    await expect(
      service.requestExtension(student, ids.submission, {
        reason: "A second simultaneous request must not be accepted",
        proposed_due_at: new Date(Date.now() + 21 * 86_400_000).toISOString(),
      }),
    ).rejects.toThrow("EXTENSION_ALREADY_OPEN");
    const decided = (await service.decideExtension(
      programManager,
      requested.id,
      String(requested.version),
      { decision: "APPROVE", reason: "Evidence reviewed and accepted" },
    )) as { status: string };
    expect(decided.status).toBe("APPROVED");
    const due = await db.query<{ extended: boolean }>(
      `SELECT effective_due_at > now()+interval '15 days' extended FROM academic_submissions WHERE id=$1`,
      [ids.submission],
    );
    expect(due.rows[0]?.extended).toBe(true);
  });

  it("snapshots and locks an approved one-level thank-you letter version", async () => {
    const created = (await service.createLetter(student, {
      student_id: ids.student,
      period_id: ids.period,
      content: "Thank you for supporting my education and future goals.",
    })) as { id: string; version: number };
    const submitted = (await service.submitLetter(
      student,
      created.id,
      String(created.version),
    )) as { version: number; status: string };
    expect(submitted.status).toBe("SCHOOL_REVIEW");
    const approved = (await service.reviewLetter(
      schoolManager,
      created.id,
      String(submitted.version),
      { decision: "APPROVE" },
    )) as { status: string };
    expect(approved.status).toBe("APPROVED");
    await expect(
      db.query(
        `UPDATE thank_you_letter_versions SET content='mutated' WHERE letter_id=$1`,
        [created.id],
      ),
    ).rejects.toThrow("append-only");
  });
});
