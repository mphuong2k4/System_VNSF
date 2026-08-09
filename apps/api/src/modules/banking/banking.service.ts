import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import { can, toActor } from "../authorization/policy.js";
import { CryptoService } from "../identity/crypto.service.js";
import type { AuthContext } from "../identity/session.guard.js";

const accountSchema = z
  .object({
    account_name: z.string().trim().min(2).max(150),
    account_number: z
      .string()
      .regex(/^[\d -]{6,40}$/)
      .refine((value) => {
        const normalized = normalizeAccountNumber(value);
        return /^\d{6,30}$/.test(normalized);
      }, "BANK_ACCOUNT_NUMBER_INVALID"),
    bank_code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,20}$/),
    correction_reason: z.string().trim().min(10).max(500).optional(),
  })
  .strict();
const reviewSchema = z
  .object({
    decision: z.enum(["VALIDATED", "REJECTED"]),
    reason: z.string().trim().min(10).max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === "REJECTED" && !value.reason)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "REASON_REQUIRED",
      });
  });
const revealSchema = z
  .object({ purpose: z.string().trim().min(10).max(500) })
  .strict();

type AccountRow = {
  id: string;
  student_id: string;
  current_school_id: string;
  account_name_ciphertext: Buffer;
  account_number_ciphertext: Buffer;
  bank_code: string;
  status: "PENDING_REVIEW" | "VALIDATED" | "REJECTED";
  rejection_reason: string | null;
  version: number;
  effective_from: Date;
  verified_at: Date | null;
};

@Injectable()
export class BankingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly crypto: CryptoService,
  ) {}

  async get(auth: AuthContext, studentId: string) {
    studentId = z.string().uuid().parse(studentId);
    const row = await this.active(studentId);
    if (!row || !this.mayRead(auth, row))
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return this.masked(row);
  }

  async save(
    auth: AuthContext,
    studentId: string,
    etag: string | undefined,
    input: unknown,
    correlationId: string,
  ) {
    studentId = z.string().uuid().parse(studentId);
    const expected = parseEtag(etag);
    const value = accountSchema.parse(input);
    const student = await this.db.query<{ current_school_id: string }>(
      `SELECT current_school_id FROM students WHERE id=$1`,
      [studentId],
    );
    const schoolId = student.rows[0]?.current_school_id;
    if (
      !schoolId ||
      (!auth.roles.includes("SUPER_ADMIN") &&
        !can(toActor(auth), "bank.self", { studentId, schoolId }))
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    const normalizedNumber = normalizeAccountNumber(value.account_number);
    let result;
    try {
      result = await this.db.transaction(async (client) => {
        const current = await client.query<AccountRow>(
          `SELECT b.*,s.current_school_id FROM student_bank_accounts b JOIN students s ON s.id=b.student_id WHERE b.student_id=$1 AND b.effective_to IS NULL FOR UPDATE`,
          [studentId],
        );
        const active = current.rows[0];
        if (
          (!active && expected !== 0) ||
          (active && active.version !== expected)
        )
          throw new DomainError("VERSION_CONFLICT", 412);
        if (active?.status === "VALIDATED") {
          if (!auth.roles.includes("SUPER_ADMIN"))
            throw new DomainError("RESOURCE_NOT_FOUND", 404);
          if (!value.correction_reason)
            throw new DomainError("REASON_REQUIRED", 422);
        }
        if (active)
          await client.query(
            `UPDATE student_bank_accounts SET effective_to=now(),updated_at=now() WHERE id=$1`,
            [active.id],
          );
        return client.query<AccountRow>(
          `INSERT INTO student_bank_accounts(student_id,account_name_ciphertext,account_number_ciphertext,account_hmac,key_version,bank_code,status,version)
         VALUES($1,$2,$3,$4,1,$5,'PENDING_REVIEW',$6) RETURNING *, $7::uuid current_school_id`,
          [
            studentId,
            this.crypto.encrypt(value.account_name),
            this.crypto.encrypt(normalizedNumber),
            this.crypto.hash(`${value.bank_code}:${normalizedNumber}`),
            value.bank_code,
            expected + 1,
            schoolId,
          ],
        );
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new DomainError("VERSION_CONFLICT", 412);
      throw error;
    }
    const saved = result.rows[0]!;
    if (value.correction_reason)
      await this.db.query(
        `INSERT INTO audit_events(actor_id,action,resource_type,resource_id,result,after_redacted,correlation_id)
         VALUES($1,'bank.correct','student_bank_account',$2,'SUCCESS',$3,$4)`,
        [
          auth.userId,
          saved.id,
          JSON.stringify({
            student_id: studentId,
            reason: value.correction_reason,
            replacement_version: saved.version,
          }),
          correlationId,
        ],
      );
    return this.masked(saved);
  }

  async review(
    auth: AuthContext,
    studentId: string,
    etag: string | undefined,
    input: unknown,
  ) {
    studentId = z.string().uuid().parse(studentId);
    const expected = parseEtag(etag);
    const value = reviewSchema.parse(input);
    const current = await this.active(studentId);
    if (
      !current ||
      !can(toActor(auth), "bank.verify", {
        studentId,
        schoolId: current.current_school_id,
      })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    if (current.status !== "PENDING_REVIEW")
      throw new DomainError("INVALID_STATE_TRANSITION", 409);
    const result = await this.db.query<AccountRow>(
      `UPDATE student_bank_accounts SET status=$3,rejection_reason=$4,verified_by=$5,verified_at=now(),updated_at=now(),version=version+1
       WHERE id=$1 AND version=$2 AND effective_to IS NULL RETURNING *, $6::uuid current_school_id`,
      [
        current.id,
        expected,
        value.decision,
        value.decision === "REJECTED" ? value.reason : null,
        auth.userId,
        current.current_school_id,
      ],
    );
    if (!result.rows[0]) throw new DomainError("VERSION_CONFLICT", 412);
    return this.masked(result.rows[0]);
  }

  async reveal(
    auth: AuthContext,
    studentId: string,
    input: unknown,
    correlationId: string,
  ) {
    studentId = z.string().uuid().parse(studentId);
    const value = revealSchema.parse(input);
    const current = await this.active(studentId);
    if (
      !current ||
      !can(toActor(auth), "bank.verify", {
        studentId,
        schoolId: current.current_school_id,
      })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    const recent = await this.db.query(
      `SELECT 1 FROM sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() AND reauthenticated_at>now()-interval '5 minutes'`,
      [auth.sessionId, auth.userId],
    );
    if (!recent.rowCount)
      throw new DomainError("REAUTHENTICATION_REQUIRED", 401);
    await this.db.query(
      `INSERT INTO audit_events(actor_id,action,resource_type,resource_id,result,after_redacted,correlation_id)
       VALUES($1,'bank.reveal','student_bank_account',$2,'SUCCESS',$3,$4)`,
      [
        auth.userId,
        current.id,
        JSON.stringify({ purpose: value.purpose, student_id: studentId }),
        correlationId,
      ],
    );
    return {
      id: current.id,
      student_id: studentId,
      account_name: this.crypto.decrypt(current.account_name_ciphertext),
      account_number: this.crypto.decrypt(current.account_number_ciphertext),
      bank_code: current.bank_code,
      status: current.status,
      version: current.version,
    };
  }

  private async active(studentId: string) {
    return (
      await this.db.query<AccountRow>(
        `SELECT b.*,s.current_school_id FROM student_bank_accounts b JOIN students s ON s.id=b.student_id WHERE b.student_id=$1 AND b.effective_to IS NULL`,
        [studentId],
      )
    ).rows[0];
  }
  private mayRead(auth: AuthContext, row: AccountRow) {
    const actor = toActor(auth);
    return (
      can(actor, "bank.self", {
        studentId: row.student_id,
        schoolId: row.current_school_id,
      }) ||
      can(actor, "bank.verify", {
        studentId: row.student_id,
        schoolId: row.current_school_id,
      })
    );
  }
  private masked(row: AccountRow) {
    return {
      id: row.id,
      student_id: row.student_id,
      account_name_masked: maskAccountName(
        this.crypto.decrypt(row.account_name_ciphertext),
      ),
      account_number_masked: maskAccountNumber(
        this.crypto.decrypt(row.account_number_ciphertext),
      ),
      bank_code: row.bank_code,
      status: row.status,
      rejection_reason: row.rejection_reason,
      version: row.version,
      effective_from: row.effective_from,
      verified_at: row.verified_at,
    };
  }
}

export const normalizeAccountNumber = (value: string) =>
  value.replaceAll(/\s|-/g, "");
export const maskAccountNumber = (value: string) =>
  `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
export const maskAccountName = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .map(
      (part) => `${part[0] ?? ""}${"*".repeat(Math.max(1, part.length - 1))}`,
    )
    .join(" ");
function parseEtag(etag: string | undefined) {
  if (!etag) throw new DomainError("PRECONDITION_REQUIRED", 428);
  const expected = Number(etag.replaceAll('"', ""));
  if (!Number.isInteger(expected) || expected < 0)
    throw new DomainError("PRECONDITION_INVALID", 400);
  return expected;
}
function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}
