import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BankingService } from "../../src/modules/banking/banking.service.js";
import { CryptoService } from "../../src/modules/identity/crypto.service.js";
import { DatabaseService } from "../../src/database/database.service.js";
import type { AuthContext } from "../../src/modules/identity/session.guard.js";

const suite = process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;
suite("banking persistence and disclosure controls", () => {
  const ids = {
    user: randomUUID(),
    manager: randomUUID(),
    session: randomUUID(),
    school: randomUUID(),
    program: randomUUID(),
    student: randomUUID(),
  };
  let db: DatabaseService;
  let service: BankingService;
  const studentAuth: AuthContext = {
    sessionId: randomUUID(),
    userId: ids.user,
    roles: ["STUDENT"],
    schoolIds: [],
    studentId: ids.student,
    mfaVerified: true,
  };
  const managerAuth: AuthContext = {
    sessionId: ids.session,
    userId: ids.manager,
    roles: ["PROGRAM_MANAGER"],
    schoolIds: [],
    mfaVerified: true,
  };

  beforeAll(async () => {
    db = new DatabaseService();
    service = new BankingService(db, new CryptoService());
    await db.query(
      `INSERT INTO users(id,email,password_hash,status) VALUES($1,$2,'synthetic','ACTIVE'),($3,$4,'synthetic','ACTIVE')`,
      [
        ids.user,
        `${ids.user}@test.local`,
        ids.manager,
        `${ids.manager}@test.local`,
      ],
    );
    await db.query(
      `INSERT INTO schools(id,code,name) VALUES($1,$2,'Synthetic School')`,
      [ids.school, `S${ids.school.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO programs(id,code,name,workflow_type) VALUES($1,$2,'Synthetic Program','ONE_LEVEL')`,
      [ids.program, `P${ids.program.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO students(id,student_code,full_name,date_of_birth,program_id,current_school_id) VALUES($1,$2,'Synthetic Student','2010-01-01',$3,$4)`,
      [ids.student, `T${ids.student.slice(0, 8)}`, ids.program, ids.school],
    );
    await db.query(
      `INSERT INTO sessions(id,user_id,token_hash,csrf_hash,mfa_verified_at,expires_at) VALUES($1,$2,$3,$4,now(),now()+interval '1 hour')`,
      [ids.session, ids.manager, "a".repeat(64), "b".repeat(64)],
    );
  });
  afterAll(async () => {
    await db.query(`DELETE FROM audit_events WHERE actor_id IN($1,$2)`, [
      ids.user,
      ids.manager,
    ]);
    await db.query(`DELETE FROM student_bank_accounts WHERE student_id=$1`, [
      ids.student,
    ]);
    await db.query(`DELETE FROM sessions WHERE id=$1`, [ids.session]);
    await db.query(`DELETE FROM students WHERE id=$1`, [ids.student]);
    await db.query(`DELETE FROM programs WHERE id=$1`, [ids.program]);
    await db.query(`DELETE FROM schools WHERE id=$1`, [ids.school]);
    await db.query(`DELETE FROM users WHERE id IN($1,$2)`, [
      ids.user,
      ids.manager,
    ]);
    await db.onModuleDestroy();
  });
  it("stores ciphertext, masks reads, reviews with locking, and audits re-authenticated reveal", async () => {
    const saved = await service.save(studentAuth, ids.student, "0", {
      account_name: "Nguyen Van An",
      account_number: "0123-456 789",
      bank_code: "VCB",
    });
    expect(saved).toMatchObject({
      account_number_masked: "******6789",
      status: "PENDING_REVIEW",
      version: 1,
    });
    const raw = await db.query<{ account_number_ciphertext: Buffer }>(
      `SELECT account_number_ciphertext FROM student_bank_accounts WHERE student_id=$1 AND effective_to IS NULL`,
      [ids.student],
    );
    expect(
      raw.rows[0]!.account_number_ciphertext.toString("utf8"),
    ).not.toContain("0123456789");
    const reviewed = await service.review(managerAuth, ids.student, '"1"', {
      decision: "VALIDATED",
    });
    expect(reviewed).toMatchObject({ status: "VALIDATED", version: 2 });
    const correlationId = randomUUID();
    await expect(
      service.reveal(
        managerAuth,
        ids.student,
        { purpose: "Verify scholarship transfer destination" },
        correlationId,
      ),
    ).rejects.toThrow("REAUTHENTICATION_REQUIRED");
    await db.query(`UPDATE sessions SET reauthenticated_at=now() WHERE id=$1`, [
      ids.session,
    ]);
    const revealed = await service.reveal(
      managerAuth,
      ids.student,
      { purpose: "Verify scholarship transfer destination" },
      correlationId,
    );
    expect(revealed).toMatchObject({
      account_name: "Nguyen Van An",
      account_number: "0123456789",
    });
    const audit = await db.query(
      `SELECT 1 FROM audit_events WHERE actor_id=$1 AND action='bank.reveal' AND correlation_id=$2`,
      [ids.manager, correlationId],
    );
    expect(audit.rowCount).toBe(1);
  });
});
