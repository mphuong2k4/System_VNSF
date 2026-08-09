import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import { can, toActor } from "../authorization/policy.js";
import type { AuthContext } from "../identity/session.guard.js";

const money = z
  .string()
  .regex(/^\d{1,16}(\.\d{1,2})?$/)
  .nullable()
  .optional();
const expenseSchema = z
  .object({
    vnd_per_term: money,
    vnd_per_year: money,
    usd_amount: money,
    liability: money,
    tutoring_money: money,
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();
const actionSchema = z
  .object({ reason: z.string().trim().min(10).max(1000).optional() })
  .strict();
const supportSchema = z
  .object({
    program_code: z.string().trim().min(2).max(30),
    received: z.boolean(),
    received_date: z.string().date().nullable().optional(),
    support_value: money,
    currency: z.enum(["VND", "USD"]).default("VND"),
    status: z.enum(["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.received && !v.received_date)
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["received_date"],
        message: "RECEIVED_DATE_REQUIRED",
      });
    if (!v.received && v.received_date)
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["received_date"],
        message: "RECEIVED_DATE_NOT_ALLOWED",
      });
  });
type StudentContext = {
  id: string;
  current_school_id: string;
  grade_level_current: number | null;
};
type ExpenseRow = {
  id: string;
  student_id: string;
  school_id: string;
  academic_year: string;
  vnd_per_term: string | null;
  vnd_per_year: string | null;
  usd_amount: string | null;
  liability: string | null;
  tutoring_money: string | null;
  notes: string | null;
  status: "DRAFT" | "SUBMITTED" | "RETURNED" | "CONFIRMED";
  version: number;
  updated_by: string;
  updated_at: Date;
};
type SupportRow = {
  id: string;
  student_id: string;
  school_id: string;
  program_code: string;
  received: boolean;
  received_date: string | null;
  support_value: string | null;
  currency: "VND" | "USD";
  status: string;
  notes: string | null;
  active: boolean;
  version: number;
};

@Injectable()
export class AssistanceService {
  constructor(private readonly db: DatabaseService) {}
  async getExpense(auth: AuthContext, studentId: string, year: string) {
    const student = await this.student(studentId);
    this.assertRead(auth, student, "expense.read");
    year = academicYear(year);
    const row = (
      await this.db.query<ExpenseRow>(
        `SELECT * FROM education_expenses WHERE student_id=$1 AND academic_year=$2`,
        [student.id, year],
      )
    ).rows[0];
    if (!row) throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return row;
  }
  async saveExpense(
    auth: AuthContext,
    studentId: string,
    year: string,
    etag: string | undefined,
    input: unknown,
  ) {
    const student = await this.student(studentId);
    this.assertManagedWrite(auth, student, "expense.write");
    year = academicYear(year);
    const expected = parseEtag(etag, true);
    const value = expenseSchema.parse(input);
    try {
      return await this.db.transaction(async (client) => {
        const current = (
          await client.query<ExpenseRow>(
            `SELECT * FROM education_expenses WHERE student_id=$1 AND academic_year=$2 FOR UPDATE`,
            [student.id, year],
          )
        ).rows[0];
        if (
          (!current && expected !== 0) ||
          (current && current.version !== expected)
        )
          throw new DomainError("VERSION_CONFLICT", 412);
        if (current?.status === "CONFIRMED")
          throw new DomainError("EXPENSE_CORRECTION_REQUIRED", 409);
        const row = current
          ? (
              await client.query<ExpenseRow>(
                `UPDATE education_expenses SET vnd_per_term=$3,vnd_per_year=$4,usd_amount=$5,liability=$6,tutoring_money=$7,notes=$8,status=CASE WHEN status='RETURNED' THEN 'DRAFT' ELSE status END,version=version+1,updated_by=$9,updated_at=now() WHERE id=$1 AND version=$2 RETURNING *`,
                [
                  current.id,
                  expected,
                  value.vnd_per_term ?? null,
                  value.vnd_per_year ?? null,
                  value.usd_amount ?? null,
                  value.liability ?? null,
                  value.tutoring_money ?? null,
                  value.notes ?? null,
                  auth.userId,
                ],
              )
            ).rows[0]!
          : (
              await client.query<ExpenseRow>(
                `INSERT INTO education_expenses(student_id,school_id,academic_year,vnd_per_term,vnd_per_year,usd_amount,liability,tutoring_money,notes,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
                [
                  student.id,
                  student.current_school_id,
                  year,
                  value.vnd_per_term ?? null,
                  value.vnd_per_year ?? null,
                  value.usd_amount ?? null,
                  value.liability ?? null,
                  value.tutoring_money ?? null,
                  value.notes ?? null,
                  auth.userId,
                ],
              )
            ).rows[0]!;
        await this.expenseVersion(
          client,
          row,
          current ? "UPDATED" : "CREATED",
          auth.userId,
        );
        return row;
      });
    } catch (error) {
      translateConstraint(error);
    }
  }
  async expenseAction(
    auth: AuthContext,
    studentId: string,
    year: string,
    action: string,
    etag: string | undefined,
    key: string | undefined,
    input: unknown,
    correlationId: string,
  ) {
    const student = await this.student(studentId);
    year = academicYear(year);
    const expected = parseEtag(etag);
    this.requireKey(key);
    const body = actionSchema.parse(input);
    const normalized = action.toUpperCase();
    if (!["SUBMIT", "RETURN", "CONFIRM", "CORRECT"].includes(normalized))
      throw new DomainError("ACTION_NOT_SUPPORTED", 404);
    if (normalized === "CORRECT") {
      if (!auth.roles.includes("SUPER_ADMIN"))
        throw new DomainError("RESOURCE_NOT_FOUND", 404);
    } else if (normalized === "SUBMIT")
      this.assertManagedWrite(auth, student, "expense.write");
    else if (
      !can(toActor(auth), "expense.review", {
        studentId: student.id,
        schoolId: student.current_school_id,
      })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    if (["RETURN", "CORRECT"].includes(normalized) && !body.reason)
      throw new DomainError("REASON_REQUIRED", 422);
    return this.db.transaction(async (client) => {
      const request = {
        studentId,
        year,
        action: normalized,
        ...body,
        version: expected,
      };
      const cached = await this.cached<ExpenseRow>(
        client,
        auth.userId,
        "EXPENSE_ACTION",
        key!,
        request,
      );
      if (cached) return cached;
      const current = (
        await client.query<ExpenseRow>(
          `SELECT * FROM education_expenses WHERE student_id=$1 AND academic_year=$2 FOR UPDATE`,
          [student.id, year],
        )
      ).rows[0];
      if (!current) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      if (current.version !== expected)
        throw new DomainError("VERSION_CONFLICT", 412);
      const target = expenseTarget(current.status, normalized);
      const updated = (
        await client.query<ExpenseRow>(
          `UPDATE education_expenses SET status=$2,version=version+1,updated_by=$3,updated_at=now() WHERE id=$1 RETURNING *`,
          [current.id, target, auth.userId],
        )
      ).rows[0]!;
      await this.expenseVersion(
        client,
        updated,
        {
          SUBMIT: "SUBMITTED",
          RETURN: "RETURNED",
          CONFIRM: "CONFIRMED",
          CORRECT: "CORRECTED",
        }[normalized]!,
        auth.userId,
        body.reason,
      );
      await this.remember(
        client,
        auth.userId,
        "EXPENSE_ACTION",
        key!,
        request,
        updated,
      );
      await client.query(
        `INSERT INTO audit_events(actor_id,action,resource_type,resource_id,result,after_redacted,correlation_id) VALUES($1,$2,'education_expense',$3,'SUCCESS',$4,$5)`,
        [
          auth.userId,
          `expense.${normalized.toLowerCase()}`,
          current.id,
          JSON.stringify({
            academic_year: year,
            status: target,
            reason: body.reason ?? null,
          }),
          correlationId,
        ],
      );
      await client.query(
        `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload) VALUES('EXPENSE',$1,$2,$3)`,
        [
          current.id,
          `expense.${target.toLowerCase()}`,
          JSON.stringify({
            expense_id: current.id,
            student_id: student.id,
            academic_year: year,
            status: target,
          }),
        ],
      );
      return updated;
    });
  }
  async supportCatalog(auth: AuthContext, studentId: string) {
    const student = await this.student(studentId);
    this.assertRead(auth, student, "support.read");
    return (
      await this.db.query(
        `SELECT code,name_vi,name_en FROM support_program_catalog WHERE active ORDER BY code`,
      )
    ).rows;
  }
  async listSupports(auth: AuthContext, studentId: string) {
    const student = await this.student(studentId);
    this.assertRead(auth, student, "support.read");
    return (
      await this.db.query<SupportRow>(
        `SELECT * FROM student_support_programs WHERE student_id=$1 AND active ORDER BY created_at DESC`,
        [student.id],
      )
    ).rows;
  }
  async addSupport(auth: AuthContext, studentId: string, input: unknown) {
    const student = await this.student(studentId);
    this.assertManagedWrite(auth, student, "support.write");
    const value = supportSchema.parse(input);
    try {
      return await this.db.transaction(async (client) => {
        const row = (
          await client.query<SupportRow>(
            `INSERT INTO student_support_programs(student_id,school_id,program_code,received,received_date,support_value,currency,status,notes,created_by,updated_by) SELECT $1,$2,c.code,$4,$5,$6,$7,$8,$9,$10,$10 FROM support_program_catalog c WHERE c.code=$3 AND c.active RETURNING *`,
            [
              student.id,
              student.current_school_id,
              value.program_code,
              value.received,
              value.received_date ?? null,
              value.support_value ?? null,
              value.currency,
              value.status,
              value.notes ?? null,
              auth.userId,
            ],
          )
        ).rows[0];
        if (!row) throw new DomainError("SUPPORT_PROGRAM_INVALID", 422);
        await this.supportVersion(client, row, "CREATED", auth.userId);
        return row;
      });
    } catch (error) {
      translateConstraint(error);
    }
  }
  async updateSupport(
    auth: AuthContext,
    studentId: string,
    id: string,
    etag: string | undefined,
    input: unknown,
  ) {
    const student = await this.student(studentId);
    this.assertManagedWrite(auth, student, "support.write");
    id = z.string().uuid().parse(id);
    const expected = parseEtag(etag);
    const value = supportSchema.parse(input);
    try {
      return await this.db.transaction(async (client) => {
        const catalog = await client.query(
          `SELECT 1 FROM support_program_catalog WHERE code=$1 AND active`,
          [value.program_code],
        );
        if (!catalog.rowCount)
          throw new DomainError("SUPPORT_PROGRAM_INVALID", 422);
        const row = (
          await client.query<SupportRow>(
            `UPDATE student_support_programs SET program_code=$4,received=$5,received_date=$6,support_value=$7,currency=$8,status=$9,notes=$10,version=version+1,updated_by=$11,updated_at=now() WHERE id=$1 AND student_id=$2 AND version=$3 AND active RETURNING *`,
            [
              id,
              student.id,
              expected,
              value.program_code,
              value.received,
              value.received_date ?? null,
              value.support_value ?? null,
              value.currency,
              value.status,
              value.notes ?? null,
              auth.userId,
            ],
          )
        ).rows[0];
        if (!row) throw new DomainError("VERSION_CONFLICT", 412);
        await this.supportVersion(client, row, "UPDATED", auth.userId);
        return row;
      });
    } catch (error) {
      translateConstraint(error);
    }
  }
  async archiveSupport(
    auth: AuthContext,
    studentId: string,
    id: string,
    etag: string | undefined,
  ) {
    const student = await this.student(studentId);
    this.assertManagedWrite(auth, student, "support.write");
    id = z.string().uuid().parse(id);
    const expected = parseEtag(etag);
    return this.db.transaction(async (client) => {
      const row = (
        await client.query<SupportRow>(
          `UPDATE student_support_programs SET active=false,version=version+1,updated_by=$4,updated_at=now() WHERE id=$1 AND student_id=$2 AND version=$3 AND active RETURNING *`,
          [id, student.id, expected, auth.userId],
        )
      ).rows[0];
      if (!row) throw new DomainError("VERSION_CONFLICT", 412);
      await this.supportVersion(client, row, "ARCHIVED", auth.userId);
      return { archived: true, id };
    });
  }
  private async student(id: string) {
    id = z.string().uuid().parse(id);
    const row = (
      await this.db.query<StudentContext>(
        `SELECT id,current_school_id,grade_level_current FROM students WHERE id=$1`,
        [id],
      )
    ).rows[0];
    if (!row) throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return row;
  }
  private assertRead(auth: AuthContext, s: StudentContext, action: string) {
    if (
      !can(toActor(auth), action, {
        studentId: s.id,
        schoolId: s.current_school_id,
      })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
  }
  private assertManagedWrite(
    auth: AuthContext,
    s: StudentContext,
    action: string,
  ) {
    const actor = toActor(auth);
    const admin = actor.roles.some((r) =>
      ["SUPER_ADMIN", "PROGRAM_MANAGER"].includes(r),
    );
    const schoolManaged =
      s.grade_level_current === null || s.grade_level_current <= 9;
    const allowed =
      admin ||
      (schoolManaged &&
        actor.roles.includes("SCHOOL_MANAGER") &&
        actor.schoolIds.includes(s.current_school_id)) ||
      (!schoolManaged &&
        actor.roles.includes("STUDENT") &&
        actor.studentId === s.id);
    if (
      !allowed ||
      !can(actor, action, { studentId: s.id, schoolId: s.current_school_id })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
  }
  private async expenseVersion(
    client: PoolClient,
    row: ExpenseRow,
    action: string,
    actor: string,
    reason?: string,
  ) {
    await client.query(
      `INSERT INTO education_expense_versions(expense_id,version_no,action,snapshot_json,reason,changed_by) VALUES($1,$2,$3,$4,$5,$6)`,
      [row.id, row.version, action, JSON.stringify(row), reason ?? null, actor],
    );
  }
  private async supportVersion(
    client: PoolClient,
    row: SupportRow,
    action: string,
    actor: string,
  ) {
    await client.query(
      `INSERT INTO student_support_program_versions(support_id,version_no,action,snapshot_json,changed_by) VALUES($1,$2,$3,$4,$5)`,
      [row.id, row.version, action, JSON.stringify(row), actor],
    );
  }
  private requireKey(key: string | undefined) {
    if (!key || key.length < 16 || key.length > 128)
      throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", 400);
  }
  private async cached<T>(
    c: PoolClient,
    a: string,
    o: string,
    k: string,
    input: unknown,
  ) {
    const r = (
      await c.query<{ request_hash: string; response_body_ref: string }>(
        `SELECT request_hash,response_body_ref FROM idempotency_records WHERE actor_id=$1 AND operation=$2 AND key=$3`,
        [a, o, k],
      )
    ).rows[0];
    if (!r) return undefined;
    if (r.request_hash !== hash(input))
      throw new DomainError("IDEMPOTENCY_KEY_REUSED", 409);
    return JSON.parse(r.response_body_ref) as T;
  }
  private async remember(
    c: PoolClient,
    a: string,
    o: string,
    k: string,
    input: unknown,
    response: unknown,
  ) {
    await c.query(
      `INSERT INTO idempotency_records(actor_id,operation,key,request_hash,response_status,response_body_ref,expires_at) VALUES($1,$2,$3,$4,200,$5,now()+interval '24 hours')`,
      [a, o, k, hash(input), JSON.stringify(response)],
    );
  }
}
export function expenseTarget(
  state: ExpenseRow["status"],
  action: string,
): ExpenseRow["status"] {
  const targets: Record<
    string,
    Partial<Record<string, ExpenseRow["status"]>>
  > = {
    DRAFT: { SUBMIT: "SUBMITTED" },
    RETURNED: { SUBMIT: "SUBMITTED" },
    SUBMITTED: { RETURN: "RETURNED", CONFIRM: "CONFIRMED" },
    CONFIRMED: { CORRECT: "DRAFT" },
  };
  const target = targets[state]?.[action];
  if (!target) throw new DomainError("INVALID_STATE_TRANSITION", 409);
  return target;
}
const academicYear = (v: string) =>
  z
    .string()
    .regex(/^20\d{2}-20\d{2}$/)
    .refine(
      (y) => Number(y.slice(5)) === Number(y.slice(0, 4)) + 1,
      "ACADEMIC_YEAR_INVALID",
    )
    .parse(v);
const parseEtag = (v: string | undefined, allowZero = false) => {
  if (!v) throw new DomainError("PRECONDITION_REQUIRED", 428);
  const n = Number(v.replaceAll('"', ""));
  if (!Number.isInteger(n) || n < (allowZero ? 0 : 1))
    throw new DomainError("PRECONDITION_INVALID", 400);
  return n;
};
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
function translateConstraint(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (code === "23505") throw new DomainError("RESOURCE_CONFLICT", 409);
    if (code === "23503") throw new DomainError("SUPPORT_PROGRAM_INVALID", 422);
  }
  throw error;
}
