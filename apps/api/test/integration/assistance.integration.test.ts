import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/database/database.service.js";
import { AssistanceService } from "../../src/modules/assistance/assistance.service.js";
import type { AuthContext } from "../../src/modules/identity/session.guard.js";
const suite = process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;
suite("education expenses and support persistence", () => {
  const ids = {
    school: randomUUID(),
    program: randomUUID(),
    manager: randomUUID(),
    reviewer: randomUUID(),
    studentUser: randomUUID(),
    junior: randomUUID(),
    senior: randomUUID(),
  };
  let db: DatabaseService;
  let service: AssistanceService;
  const schoolManager: AuthContext = {
    sessionId: randomUUID(),
    userId: ids.manager,
    roles: ["SCHOOL_MANAGER"],
    schoolIds: [ids.school],
    mfaVerified: true,
  };
  const reviewer: AuthContext = {
    sessionId: randomUUID(),
    userId: ids.reviewer,
    roles: ["PROGRAM_MANAGER"],
    schoolIds: [],
    mfaVerified: true,
  };
  const superAdmin: AuthContext = {
    ...reviewer,
    roles: ["SUPER_ADMIN"],
  };
  const senior: AuthContext = {
    sessionId: randomUUID(),
    userId: ids.studentUser,
    roles: ["STUDENT"],
    schoolIds: [],
    studentId: ids.senior,
    mfaVerified: true,
  };
  beforeAll(async () => {
    db = new DatabaseService();
    service = new AssistanceService(db);
    await db.query(
      `INSERT INTO users(id,email,password_hash,status) VALUES($1,$2,'x','ACTIVE'),($3,$4,'x','ACTIVE'),($5,$6,'x','ACTIVE')`,
      [
        ids.manager,
        `${ids.manager}@test.local`,
        ids.reviewer,
        `${ids.reviewer}@test.local`,
        ids.studentUser,
        `${ids.studentUser}@test.local`,
      ],
    );
    await db.query(
      `INSERT INTO schools(id,code,name) VALUES($1,$2,'Assistance School')`,
      [ids.school, `S${ids.school.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO programs(id,code,name,workflow_type) VALUES($1,$2,'Assistance Program','ONE_LEVEL')`,
      [ids.program, `P${ids.program.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO students(id,student_code,full_name,date_of_birth,program_id,current_school_id,grade_level_current) VALUES($1,$2,'Junior','2012-01-01',$5,$6,9),($3,$4,'Senior','2009-01-01',$5,$6,10)`,
      [
        ids.junior,
        `J${ids.junior.slice(0, 8)}`,
        ids.senior,
        `H${ids.senior.slice(0, 8)}`,
        ids.program,
        ids.school,
      ],
    );
  });
  afterAll(async () => db.onModuleDestroy());
  it("enforces grade ownership and preserves confirmed expense versions", async () => {
    const junior = await service.saveExpense(
      schoolManager,
      ids.junior,
      "2025-2026",
      "0",
      { vnd_per_year: "12000000.00", notes: "School managed" },
    );
    expect(junior.status).toBe("DRAFT");
    await expect(
      service.saveExpense(schoolManager, ids.senior, "2025-2026", "0", {
        vnd_per_year: "1.00",
      }),
    ).rejects.toThrow("RESOURCE_NOT_FOUND");
    let expense = await service.saveExpense(
      senior,
      ids.senior,
      "2025-2026",
      "0",
      { vnd_per_term: "5000000.00", vnd_per_year: "10000000.00" },
    );
    expense = await service.expenseAction(
      senior,
      ids.senior,
      "2025-2026",
      "submit",
      String(expense.version),
      "expense-submit-key-0001",
      {},
      randomUUID(),
    );
    expect(expense.status).toBe("SUBMITTED");
    const repeated = await service.expenseAction(
      senior,
      ids.senior,
      "2025-2026",
      "submit",
      String(expense.version - 1),
      "expense-submit-key-0001",
      {},
      randomUUID(),
    );
    expect(repeated.status).toBe("SUBMITTED");
    expense = await service.expenseAction(
      reviewer,
      ids.senior,
      "2025-2026",
      "confirm",
      String(expense.version),
      "expense-confirm-key-001",
      {},
      randomUUID(),
    );
    expect(expense.status).toBe("CONFIRMED");
    await expect(
      service.saveExpense(
        senior,
        ids.senior,
        "2025-2026",
        String(expense.version),
        { vnd_per_year: "2.00" },
      ),
    ).rejects.toThrow("EXPENSE_CORRECTION_REQUIRED");
    await expect(
      service.expenseAction(
        reviewer,
        ids.senior,
        "2025-2026",
        "correct",
        String(expense.version),
        "expense-correct-manager-001",
        { reason: "Correct confirmed expense evidence" },
        randomUUID(),
      ),
    ).rejects.toThrow("RESOURCE_NOT_FOUND");
    expense = await service.expenseAction(
      superAdmin,
      ids.senior,
      "2025-2026",
      "correct",
      String(expense.version),
      "expense-correct-admin-0001",
      { reason: "Correct confirmed expense evidence" },
      randomUUID(),
    );
    expect(expense.status).toBe("DRAFT");
    const versions = await db.query<{ action: string }>(
      `SELECT action FROM education_expense_versions WHERE expense_id=$1 ORDER BY version_no`,
      [expense.id],
    );
    expect(versions.rows.map((row) => row.action)).toEqual([
      "CREATED",
      "SUBMITTED",
      "CONFIRMED",
      "CORRECTED",
    ]);
  });
  it("records, versions, updates and archives support occurrences", async () => {
    const created = await service.addSupport(schoolManager, ids.junior, {
      program_code: "DESK",
      received: true,
      received_date: "2026-08-02",
      support_value: "750000.00",
      currency: "VND",
      status: "COMPLETED",
      notes: "Delivered at school",
    });
    expect(created.version).toBe(1);
    const updated = await service.updateSupport(
      schoolManager,
      ids.junior,
      created.id,
      "1",
      {
        program_code: "DESK",
        received: true,
        received_date: "2026-08-02",
        support_value: "800000.00",
        currency: "VND",
        status: "COMPLETED",
        notes: "Corrected tracked value",
      },
    );
    expect(updated.version).toBe(2);
    await service.archiveSupport(schoolManager, ids.junior, created.id, "2");
    expect(await service.listSupports(schoolManager, ids.junior)).toHaveLength(
      0,
    );
    await expect(
      db.query(
        `UPDATE student_support_program_versions SET action='UPDATED' WHERE support_id=$1`,
        [created.id],
      ),
    ).rejects.toThrow("version history is append-only");
  });
});
