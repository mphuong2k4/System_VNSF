import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { PoolClient } from "pg";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import { can, toActor } from "../authorization/policy.js";
import type { AuthContext } from "../identity/session.guard.js";

const startSchema = z
  .object({
    reason: z.string().min(20).max(1000),
    duration_minutes: z.number().int().min(5).max(120),
    scope: z
      .object({
        student_ids: z.array(z.string().uuid()).max(100).default([]),
        school_ids: z.array(z.string().uuid()).max(100).default([]),
      })
      .strict(),
  })
  .strict();
const endSchema = z.object({ reason: z.string().min(10).max(500) }).strict();
type BreakGlassRow = {
  id: string;
  user_id: string;
  reason: string;
  scope_json: Record<string, unknown>;
  effective_at: Date;
  expires_at: Date;
  revoked_at?: Date | null;
  ended_reason?: string | null;
};
type EndedRow = { id: string; revoked_at: Date; ended_reason: string };

@Injectable()
export class BreakGlassService {
  constructor(private readonly db: DatabaseService) {}

  private authorize(auth: AuthContext) {
    if (!can(toActor(auth), "breakglass.use", {}))
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    if (!auth.mfaVerified) throw new DomainError("AUTH_MFA_REQUIRED", 401);
  }

  async list(auth: AuthContext) {
    this.authorize(auth);
    return (
      await this.db.query<BreakGlassRow>(
        `SELECT id,user_id,reason,scope_json,effective_at,expires_at,revoked_at,ended_reason
         FROM break_glass_sessions WHERE user_id=$1 ORDER BY effective_at DESC LIMIT 50`,
        [auth.userId],
      )
    ).rows;
  }

  async start(auth: AuthContext, input: unknown) {
    this.authorize(auth);
    const value = startSchema.parse(input);
    return this.db.transaction(async (client) => {
      const session = (
        await client.query<{ reauthenticated_at: Date | null }>(
          `SELECT reauthenticated_at FROM sessions WHERE id=$1 AND revoked_at IS NULL FOR UPDATE`,
          [auth.sessionId],
        )
      ).rows[0]!;
      if (
        !session?.reauthenticated_at ||
        session.reauthenticated_at.getTime() < Date.now() - 5 * 60_000
      )
        throw new DomainError("REAUTHENTICATION_REQUIRED", 403);
      await client.query(
        `UPDATE break_glass_sessions SET revoked_at=now(),ended_by=$2,ended_reason='REPLACED'
         WHERE session_id=$1 AND revoked_at IS NULL AND expires_at>now()`,
        [auth.sessionId, auth.userId],
      );
      const created = (
        await client.query<BreakGlassRow>(
          `INSERT INTO break_glass_sessions(session_id,user_id,reason,scope_json,expires_at)
           VALUES($1,$2,$3,$4,now()+make_interval(mins=>$5))
           RETURNING id,user_id,reason,scope_json,effective_at,expires_at`,
          [
            auth.sessionId,
            auth.userId,
            value.reason,
            JSON.stringify(value.scope),
            value.duration_minutes,
          ],
        )
      ).rows[0]!;
      await this.record(
        client,
        auth.userId,
        "break_glass.started",
        created.id,
        created,
      );
      return created;
    });
  }

  async end(auth: AuthContext, id: string, input: unknown) {
    this.authorize(auth);
    const value = endSchema.parse(input);
    return this.db.transaction(async (client) => {
      const ended = (
        await client.query<EndedRow>(
          `UPDATE break_glass_sessions SET revoked_at=now(),ended_by=$3,ended_reason=$4
           WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id,revoked_at,ended_reason`,
          [id, auth.userId, auth.userId, value.reason],
        )
      ).rows[0];
      if (!ended) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      await this.record(client, auth.userId, "break_glass.ended", id, ended);
      return ended;
    });
  }

  private async record(
    client: PoolClient,
    actorId: string,
    action: string,
    id: string,
    after: unknown,
  ) {
    await client.query(
      `INSERT INTO audit_events(actor_id,action,resource_type,resource_id,result,after_redacted,correlation_id)
       VALUES($1,$2,'break_glass_session',$3,'SUCCESS',$4,gen_random_uuid())`,
      [actorId, action, id, JSON.stringify(after)],
    );
    await client.query(
      `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload)
       VALUES('BREAK_GLASS',$1,$2,$3)`,
      [id, action, JSON.stringify({ actor_id: actorId, break_glass_id: id })],
    );
  }
}
