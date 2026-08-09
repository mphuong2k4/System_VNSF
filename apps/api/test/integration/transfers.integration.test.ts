import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/database/database.service.js";
import type { AuthContext } from "../../src/modules/identity/session.guard.js";
import { TransfersService } from "../../src/modules/transfers/transfers.service.js";

const suite = process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;
suite("manual transfer persistence workflow", () => {
  const ids = {
    manager: randomUUID(),
    studentUser: randomUUID(),
    school: randomUUID(),
    program: randomUUID(),
    period: randomUUID(),
    student: randomUUID(),
  };
  let db: DatabaseService;
  let service: TransfersService;
  const manager: AuthContext = {
    sessionId: randomUUID(),
    userId: ids.manager,
    roles: ["PROGRAM_MANAGER"],
    schoolIds: [],
    mfaVerified: true,
  };
  const superAdmin: AuthContext = {
    ...manager,
    roles: ["SUPER_ADMIN"],
  };
  const student: AuthContext = {
    sessionId: randomUUID(),
    userId: ids.studentUser,
    roles: ["STUDENT"],
    schoolIds: [],
    studentId: ids.student,
    mfaVerified: true,
  };
  beforeAll(async () => {
    db = new DatabaseService();
    service = new TransfersService(db);
    await db.query(
      `INSERT INTO users(id,email,password_hash,status) VALUES($1,$2,'synthetic','ACTIVE'),($3,$4,'synthetic','ACTIVE')`,
      [
        ids.manager,
        `${ids.manager}@test.local`,
        ids.studentUser,
        `${ids.studentUser}@test.local`,
      ],
    );
    await db.query(
      `INSERT INTO schools(id,code,name) VALUES($1,$2,'Transfer Test School')`,
      [ids.school, `S${ids.school.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO programs(id,code,name,workflow_type) VALUES($1,$2,'Transfer Test Program','ONE_LEVEL')`,
      [ids.program, `P${ids.program.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO academic_periods(id,program_id,code,due_at,workflow_type) VALUES($1,$2,'PERIOD',now()+interval '30 days','ONE_LEVEL')`,
      [ids.period, ids.program],
    );
    await db.query(
      `INSERT INTO students(id,student_code,full_name,date_of_birth,program_id,current_school_id) VALUES($1,$2,'Transfer Test Student','2010-01-01',$3,$4)`,
      [ids.student, `T${ids.student.slice(0, 8)}`, ids.program, ids.school],
    );
    await db.query(
      `INSERT INTO student_bank_accounts(student_id,account_name_ciphertext,account_number_ciphertext,account_hmac,key_version,bank_code,status,verified_by,verified_at) VALUES($1,$2,$3,$4,1,'VCB','VALIDATED',$5,now())`,
      [
        ids.student,
        Buffer.from("encrypted-name"),
        Buffer.from("encrypted-number"),
        "c".repeat(64),
        ids.manager,
      ],
    );
  });
  afterAll(async () => db.onModuleDestroy());
  it("creates idempotently, confirms append-only, scopes reads and corrects by replacement", async () => {
    const input = {
      student_id: ids.student,
      period_id: ids.period,
      transfer_type: "SCHOLARSHIP",
      amount: "1250000.00",
      currency: "VND" as const,
      transferred_at: new Date().toISOString(),
      reference: "BANK-REF-001",
    };
    const created = await service.create(
      manager,
      "create-transfer-key-0001",
      input,
    );
    expect(
      (await service.create(manager, "create-transfer-key-0001", input)).id,
    ).toBe(created.id);
    await expect(
      service.create(manager, "create-transfer-key-0001", {
        ...input,
        amount: "1.00",
      }),
    ).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
    expect((await service.list(student, 1, 20)).items).toHaveLength(1);
    const schoolManager: AuthContext = {
      sessionId: randomUUID(),
      userId: randomUUID(),
      roles: ["SCHOOL_MANAGER"],
      schoolIds: [ids.school],
      mfaVerified: true,
    };
    expect((await service.list(schoolManager, 1, 20)).items).toHaveLength(1);
    expect(
      (
        await service.list(
          { ...schoolManager, schoolIds: [randomUUID()] },
          1,
          20,
        )
      ).items,
    ).toHaveLength(0);
    const confirmed = await service.confirm(
      student,
      created.id,
      "confirm-transfer-key-001",
      { result: "RECEIVED" },
    );
    expect(confirmed.status).toBe("RECEIVED");
    const correction = {
      transfer_type: "SCHOLARSHIP",
      amount: "1255000.00",
      currency: "VND",
      transferred_at: new Date().toISOString(),
      reference: "BANK-REF-001-C",
      reason_code: "AMOUNT_FIX",
      reason: "Correct the externally recorded amount",
    };
    await expect(
      service.correct(
        manager,
        created.id,
        String(confirmed.version),
        "correct-transfer-manager-001",
        correction,
      ),
    ).rejects.toThrow("RESOURCE_NOT_FOUND");
    const replacement = await service.correct(
      superAdmin,
      created.id,
      String(confirmed.version),
      "correct-transfer-key-001",
      correction,
    );
    expect(replacement.status).toBe("AWAITING_CONFIRMATION");
    const detail = await service.get(manager, created.id);
    expect(detail).toMatchObject({
      status: "CORRECTED",
      confirmation: { result: "RECEIVED" },
      correction: { replacement_id: replacement.id },
    });
    await expect(
      db.query(
        `UPDATE transfer_confirmations SET note='tamper' WHERE transfer_id=$1`,
        [created.id],
      ),
    ).rejects.toThrow("transfer evidence is append-only");
  });
});
