import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/database/database.service.js";
import type { AuthContext } from "../../src/modules/identity/session.guard.js";
import { GovernanceService } from "../../src/modules/governance/governance.service.js";

const suite = process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;
suite("governance evidence and legal hold precedence", () => {
  const adminId = randomUUID();
  const studentUserId = randomUUID();
  const schoolId = randomUUID();
  const programId = randomUUID();
  const studentId = randomUUID();
  let db: DatabaseService;
  let service: GovernanceService;
  const admin: AuthContext = {
    sessionId: randomUUID(),
    userId: adminId,
    roles: ["SUPER_ADMIN"],
    schoolIds: [],
    mfaVerified: true,
  };
  const student: AuthContext = {
    sessionId: randomUUID(),
    userId: studentUserId,
    roles: ["STUDENT"],
    schoolIds: [],
    studentId,
    mfaVerified: true,
  };
  beforeAll(async () => {
    db = new DatabaseService();
    service = new GovernanceService(db);
    await db.query(
      `INSERT INTO users(id,email,password_hash,status) VALUES($1,$2,'x','ACTIVE'),($3,$4,'x','ACTIVE')`,
      [
        adminId,
        `${adminId}@test.local`,
        studentUserId,
        `${studentUserId}@test.local`,
      ],
    );
    await db.query(
      `INSERT INTO schools(id,code,name) VALUES($1,$2,'Governance School')`,
      [schoolId, `G${Date.now()}`],
    );
    await db.query(
      `INSERT INTO programs(id,code,name,workflow_type) VALUES($1,$2,'Governance Program','ONE_LEVEL')`,
      [programId, `G${Date.now()}`],
    );
    await db.query(
      `INSERT INTO students(id,student_code,full_name,date_of_birth,program_id,current_school_id) VALUES($1,$2,'Governance Student','2010-01-01',$3,$4)`,
      [studentId, `G${studentId.slice(0, 8)}`, programId, schoolId],
    );
  });
  afterAll(async () => db.onModuleDestroy());
  it("excludes held records from retention candidates and keeps audit append-only", async () => {
    const policy = await service.createPolicy(admin, randomUUID(), {
      data_category: "NOTIFICATIONS",
      retain_for_days: 1,
      action: "ANONYMIZE",
      effective_from: new Date().toISOString(),
    });
    await db.query(
      `INSERT INTO notifications(user_id,type,payload,created_at) VALUES($1,'test.old','{}',now()-interval '10 days')`,
      [adminId],
    );
    await service.createHold(admin, randomUUID(), {
      subject_type: "NOTIFICATIONS",
      subject_ref: "*",
      reason: "Legal investigation preservation",
    });
    const run = await service.createDryRun(admin, randomUUID(), {
      policy_id: policy.id,
    });
    expect(Number(run.held_count)).toBeGreaterThan(0);
    expect(Number(run.candidate_count)).toBe(0);
    const events = await service.audit(admin, {
      action: "legal_hold.created",
      limit: "10",
    });
    expect(events.items.length).toBeGreaterThan(0);
    await expect(
      db.query(`DELETE FROM audit_events WHERE id=$1`, [events.items[0].id]),
    ).rejects.toThrow("audit_events is append-only");
  });
  it("publishes hashed consent and records idempotent self acceptance", async () => {
    const policy = await service.publishConsent(admin, randomUUID(), {
      policy_type: "TEST_CONSENT",
      locale: "en-US",
      content: "I consent to synthetic integration testing only.",
    });
    expect(policy.content_hash).toHaveLength(64);
    const first = await service.acceptConsent(
      student,
      randomUUID(),
      studentId,
      policy.id,
      { evidence: { channel: "WEB" } },
    );
    const second = await service.acceptConsent(
      student,
      randomUUID(),
      studentId,
      policy.id,
      { evidence: { channel: "WEB" } },
    );
    expect(second.id).toBe(first.id);
    const withdrawn = await service.withdrawConsent(
      student,
      randomUUID(),
      studentId,
      policy.id,
      { reason: "Changed decision" },
    );
    expect(withdrawn.withdrawn_at).toBeTruthy();
  });
});
