import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { PoolClient } from "pg";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import { can, toActor } from "../authorization/policy.js";
import type { AuthContext } from "../identity/session.guard.js";

const transferSchema = z
  .object({
    student_id: z.string().uuid(),
    period_id: z.string().uuid(),
    transfer_type: z.string().trim().min(1).max(30),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency: z.enum(["VND", "USD"]),
    transferred_at: z.string().datetime(),
    reference: z.string().trim().min(1).max(100),
  })
  .strict();
const confirmSchema = z
  .object({
    result: z.enum(["RECEIVED", "NOT_RECEIVED"]),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();
const correctionSchema = transferSchema
  .omit({ student_id: true, period_id: true })
  .extend({
    reason_code: z.string().trim().min(2).max(50),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
type TransferRow = z.infer<typeof transferSchema> & {
  id: string;
  school_id: string;
  status: string;
  version: number;
  confirmation_due_at: Date | null;
};

@Injectable()
export class TransfersService {
  constructor(private readonly db: DatabaseService) {}

  async list(auth: AuthContext, page: number, size: number) {
    const actor = toActor(auth);
    this.assertRead(actor);
    const safe = Math.min(Math.max(Number.isFinite(size) ? size : 20, 1), 100);
    const current = Math.max(Number.isFinite(page) ? page : 1, 1);
    const unrestricted = actor.roles.some((role) =>
      ["SUPER_ADMIN", "PROGRAM_MANAGER"].includes(role),
    );
    const result = await this.db.query<TransferRow & { total_count: string }>(
      `SELECT t.*,count(*) OVER() total_count FROM manual_transfers t
       WHERE $1::boolean OR t.school_id=ANY($2::uuid[]) OR t.student_id=$3::uuid
       ORDER BY t.transferred_at DESC,t.id LIMIT $4 OFFSET $5`,
      [
        unrestricted,
        actor.schoolIds,
        actor.studentId ?? null,
        safe,
        (current - 1) * safe,
      ],
    );
    return {
      items: result.rows.map(({ total_count, ...item }) => item),
      page: current,
      size: safe,
      total: Number(result.rows[0]?.total_count ?? 0),
    };
  }

  async get(auth: AuthContext, id: string) {
    id = z.string().uuid().parse(id);
    const row = (
      await this.db.query<TransferRow>(
        `SELECT * FROM manual_transfers WHERE id=$1`,
        [id],
      )
    ).rows[0];
    if (!row || !this.mayRead(auth, row))
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    const confirmation =
      (
        await this.db.query(
          `SELECT id,result,note,confirmed_at FROM transfer_confirmations WHERE transfer_id=$1`,
          [id],
        )
      ).rows[0] ?? null;
    const correction =
      (
        await this.db.query(
          `SELECT id,original_id,replacement_id,reason_code,reason,created_at FROM transfer_corrections WHERE original_id=$1 OR replacement_id=$1`,
          [id],
        )
      ).rows[0] ?? null;
    return { ...row, confirmation, correction };
  }

  async create(auth: AuthContext, key: string | undefined, input: unknown) {
    const value = transferSchema.parse(input);
    this.requireKey(key);
    if (!can(toActor(auth), "transfer.write", {}))
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return this.db.transaction(async (client) => {
      const cached = await this.cached<TransferRow>(
        client,
        auth.userId,
        "TRANSFER",
        key!,
        value,
      );
      if (cached) return cached;
      const context = await client.query<{ current_school_id: string }>(
        `SELECT s.current_school_id FROM students s JOIN academic_periods p ON p.id=$2 AND p.program_id=s.program_id
         JOIN student_bank_accounts b ON b.student_id=s.id AND b.status='VALIDATED' AND b.effective_to IS NULL WHERE s.id=$1`,
        [value.student_id, value.period_id],
      );
      if (!context.rows[0])
        throw new DomainError("TRANSFER_PREREQUISITES_NOT_MET", 422);
      const result = await client.query<TransferRow>(
        `INSERT INTO manual_transfers(student_id,period_id,school_id,created_by,transfer_type,amount,currency,transferred_at,reference,status,confirmation_due_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'AWAITING_CONFIRMATION',$8::timestamptz+interval '7 days') RETURNING *`,
        [
          value.student_id,
          value.period_id,
          context.rows[0].current_school_id,
          auth.userId,
          value.transfer_type,
          value.amount,
          value.currency,
          value.transferred_at,
          value.reference,
        ],
      );
      const response = result.rows[0]!;
      await this.remember(
        client,
        auth.userId,
        "TRANSFER",
        key!,
        value,
        response,
      );
      await this.outbox(client, response.id, "transfer.awaiting_confirmation", {
        transfer_id: response.id,
        student_id: response.student_id,
        confirmation_due_at: response.confirmation_due_at,
      });
      return response;
    });
  }

  async confirm(
    auth: AuthContext,
    id: string,
    key: string | undefined,
    input: unknown,
  ) {
    id = z.string().uuid().parse(id);
    this.requireKey(key);
    const value = confirmSchema.parse(input);
    return this.db.transaction(async (client) => {
      const cached = await this.cached<TransferRow>(
        client,
        auth.userId,
        "TRANSFER_CONFIRM",
        key!,
        { id, ...value },
      );
      if (cached) return cached;
      const current = await client.query<TransferRow>(
        `SELECT * FROM manual_transfers WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const row = current.rows[0];
      if (
        !row ||
        !can(toActor(auth), "transfer.confirm", {
          studentId: row.student_id,
          schoolId: row.school_id,
        })
      )
        throw new DomainError("RESOURCE_NOT_FOUND", 404);
      if (row.status !== "AWAITING_CONFIRMATION")
        throw new DomainError("INVALID_STATE_TRANSITION", 409);
      await client.query(
        `INSERT INTO transfer_confirmations(transfer_id,student_id,result,note,confirmed_by) VALUES($1,$2,$3,$4,$5)`,
        [id, row.student_id, value.result, value.note ?? null, auth.userId],
      );
      const status = transferResultState(value.result);
      const updated = (
        await client.query<TransferRow>(
          `UPDATE manual_transfers SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,
          [id, status],
        )
      ).rows[0]!;
      await this.remember(
        client,
        auth.userId,
        "TRANSFER_CONFIRM",
        key!,
        { id, ...value },
        updated,
      );
      await this.outbox(client, id, `transfer.${value.result.toLowerCase()}`, {
        transfer_id: id,
        student_id: row.student_id,
      });
      return updated;
    });
  }

  async correct(
    auth: AuthContext,
    id: string,
    etag: string | undefined,
    key: string | undefined,
    input: unknown,
  ) {
    id = z.string().uuid().parse(id);
    this.requireKey(key);
    const expected = parseEtag(etag);
    const value = correctionSchema.parse(input);
    if (!can(toActor(auth), "transfer.write", {}))
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return this.db.transaction(async (client) => {
      const cached = await this.cached<TransferRow>(
        client,
        auth.userId,
        "TRANSFER_CORRECT",
        key!,
        { id, ...value },
      );
      if (cached) return cached;
      const result = await client.query<TransferRow>(
        `SELECT * FROM manual_transfers WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const original = result.rows[0];
      if (!original) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      if (original.version !== expected)
        throw new DomainError("VERSION_CONFLICT", 412);
      if (["CORRECTED", "CLOSED"].includes(original.status))
        throw new DomainError("INVALID_STATE_TRANSITION", 409);
      await client.query(
        `UPDATE manual_transfers SET status='CORRECTED',version=version+1,updated_at=now() WHERE id=$1`,
        [id],
      );
      const replacement = (
        await client.query<TransferRow>(
          `INSERT INTO manual_transfers(student_id,period_id,school_id,created_by,transfer_type,amount,currency,transferred_at,reference,status,confirmation_due_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'AWAITING_CONFIRMATION',$8::timestamptz+interval '7 days') RETURNING *`,
          [
            original.student_id,
            original.period_id,
            original.school_id,
            auth.userId,
            value.transfer_type,
            value.amount,
            value.currency,
            value.transferred_at,
            value.reference,
          ],
        )
      ).rows[0]!;
      await client.query(
        `INSERT INTO transfer_corrections(original_id,replacement_id,reason_code,reason,approved_by) VALUES($1,$2,$3,$4,$5)`,
        [id, replacement.id, value.reason_code, value.reason, auth.userId],
      );
      await this.remember(
        client,
        auth.userId,
        "TRANSFER_CORRECT",
        key!,
        { id, ...value },
        replacement,
      );
      await this.outbox(client, replacement.id, "transfer.corrected", {
        original_id: id,
        replacement_id: replacement.id,
        student_id: original.student_id,
      });
      return replacement;
    });
  }

  private assertRead(actor: ReturnType<typeof toActor>) {
    if (
      !actor.roles.some((role) =>
        [
          "SUPER_ADMIN",
          "PROGRAM_MANAGER",
          "SCHOOL_MANAGER",
          "STUDENT",
        ].includes(role),
      )
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
  }
  private mayRead(auth: AuthContext, row: TransferRow) {
    const actor = toActor(auth);
    return (
      actor.roles.some((role) =>
        ["SUPER_ADMIN", "PROGRAM_MANAGER"].includes(role),
      ) ||
      (actor.roles.includes("SCHOOL_MANAGER") &&
        actor.schoolIds.includes(row.school_id)) ||
      (actor.roles.includes("STUDENT") && actor.studentId === row.student_id)
    );
  }
  private requireKey(key: string | undefined) {
    if (!key || key.length < 16 || key.length > 128)
      throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", 400);
  }
  private async cached<T>(
    client: PoolClient,
    actorId: string,
    operation: string,
    key: string,
    input: unknown,
  ) {
    const row = (
      await client.query<{ request_hash: string; response_body_ref: string }>(
        `SELECT request_hash,response_body_ref FROM idempotency_records WHERE actor_id=$1 AND operation=$2 AND key=$3`,
        [actorId, operation, key],
      )
    ).rows[0];
    if (!row) return undefined;
    if (row.request_hash !== hash(input))
      throw new DomainError("IDEMPOTENCY_KEY_REUSED", 409);
    return JSON.parse(row.response_body_ref) as T;
  }
  private async remember(
    client: PoolClient,
    actorId: string,
    operation: string,
    key: string,
    input: unknown,
    response: unknown,
  ) {
    await client.query(
      `INSERT INTO idempotency_records(actor_id,operation,key,request_hash,response_status,response_body_ref,expires_at) VALUES($1,$2,$3,$4,200,$5,now()+interval '24 hours')`,
      [actorId, operation, key, hash(input), JSON.stringify(response)],
    );
  }
  private async outbox(
    client: PoolClient,
    id: string,
    type: string,
    payload: unknown,
  ) {
    await client.query(
      `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload) VALUES('TRANSFER',$1,$2,$3)`,
      [id, type, JSON.stringify(payload)],
    );
  }
}
export const transferResultState = (result: "RECEIVED" | "NOT_RECEIVED") =>
  result === "RECEIVED" ? "RECEIVED" : "UNDER_INVESTIGATION";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function parseEtag(etag: string | undefined) {
  if (!etag) throw new DomainError("PRECONDITION_REQUIRED", 428);
  const value = Number(etag.replaceAll('"', ""));
  if (!Number.isInteger(value) || value < 1)
    throw new DomainError("PRECONDITION_INVALID", 400);
  return value;
}
