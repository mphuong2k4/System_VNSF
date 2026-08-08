import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { PoolClient, QueryResultRow } from "pg";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import type { AuthContext } from "../identity/session.guard.js";

const categories = z.enum(["AUDIT_EVENTS", "NOTIFICATIONS", "DATA_JOBS"]);
const policySchema = z.object({
  data_category: categories,
  retain_for_days: z.number().int().min(1).max(36500),
  action: z.enum(["ANONYMIZE", "PURGE"]),
  effective_from: z.string().datetime(),
});
const holdSchema = z.object({
  subject_type: z.enum([
    "AUDIT_EVENTS",
    "NOTIFICATIONS",
    "DATA_JOBS",
    "STUDENT",
  ]),
  subject_ref: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(10).max(2000),
});
const reasonSchema = z.object({ reason: z.string().trim().min(10).max(2000) });
const consentSchema = z.object({
  policy_type: z.string().trim().min(2).max(40),
  locale: z.enum(["vi-VN", "en-US"]),
  content: z.string().trim().min(20).max(50000),
});
const evidenceSchema = z.object({
  evidence: z
    .record(z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
    .default({}),
});
const withdrawalSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});
type GovernanceRow = QueryResultRow & {
  id: string;
  content_hash: string;
  held_count: string;
  candidate_count: string;
  withdrawn_at: Date | null;
};
type AuditRow = QueryResultRow & {
  id: string;
  occurred_at: Date;
};

@Injectable()
export class GovernanceService {
  constructor(private readonly db: DatabaseService) {}

  async audit(auth: AuthContext, query: Record<string, string | undefined>) {
    this.admin(auth);
    const input = z
      .object({
        actor_id: z.string().uuid().optional(),
        action: z.string().max(100).optional(),
        resource_type: z.string().max(100).optional(),
        result: z.enum(["SUCCESS", "FAILURE"]).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        cursor: z.string().datetime().optional(),
      })
      .parse(query);
    const result = await this.db.query<AuditRow>(
      `SELECT id,occurred_at,actor_id,action,resource_type,resource_id,result,before_redacted,after_redacted,correlation_id
       FROM audit_events WHERE ($1::uuid IS NULL OR actor_id=$1) AND ($2::text IS NULL OR action=$2)
       AND ($3::text IS NULL OR resource_type=$3) AND ($4::text IS NULL OR result=$4)
       AND ($5::timestamptz IS NULL OR occurred_at>=$5) AND ($6::timestamptz IS NULL OR occurred_at<$6)
       AND ($7::timestamptz IS NULL OR occurred_at<$7) ORDER BY occurred_at DESC LIMIT $8`,
      [
        input.actor_id ?? null,
        input.action ?? null,
        input.resource_type ?? null,
        input.result ?? null,
        input.from ?? null,
        input.to ?? null,
        input.cursor ?? null,
        input.limit,
      ],
    );
    return {
      items: result.rows,
      next_cursor:
        result.rows.length === input.limit
          ? result.rows.at(-1)!.occurred_at
          : null,
    };
  }

  async policies(auth: AuthContext) {
    this.admin(auth);
    return (
      await this.db.query<GovernanceRow>(
        `SELECT * FROM retention_policies ORDER BY data_category,version DESC`,
      )
    ).rows;
  }
  async createPolicy(auth: AuthContext, correlationId: string, body: unknown) {
    this.admin(auth);
    const input = policySchema.parse(body);
    return this.db.transaction(async (client) => {
      const result = await client.query<GovernanceRow>(
        `INSERT INTO retention_policies(data_category,retain_for_days,action,version,effective_from,approved_by) SELECT $1::varchar,$2::int,$3::varchar,COALESCE(max(version),0)+1,$4::timestamptz,$5::uuid FROM retention_policies WHERE data_category=$1::text RETURNING *`,
        [
          input.data_category,
          input.retain_for_days,
          input.action,
          input.effective_from,
          auth.userId,
        ],
      );
      await this.evidence(
        client,
        auth.userId,
        "retention.policy.created",
        "retention_policy",
        result.rows[0]!.id,
        correlationId,
        {
          data_category: input.data_category,
          retain_for_days: input.retain_for_days,
          action: input.action,
        },
      );
      return result.rows[0];
    });
  }

  async dryRuns(auth: AuthContext) {
    this.admin(auth);
    return (
      await this.db.query<GovernanceRow>(
        `SELECT r.*,p.data_category,p.action,p.retain_for_days FROM retention_dry_runs r JOIN retention_policies p ON p.id=r.policy_id ORDER BY r.created_at DESC LIMIT 100`,
      )
    ).rows;
  }
  async createDryRun(auth: AuthContext, correlationId: string, body: unknown) {
    this.admin(auth);
    const { policy_id } = z
      .object({ policy_id: z.string().uuid() })
      .parse(body);
    return this.db.transaction(async (client) => {
      const policyResult = await client.query<{
        id: string;
        data_category: string;
        retain_for_days: number;
      }>(`SELECT * FROM retention_policies WHERE id=$1`, [policy_id]);
      const policy = policyResult.rows[0];
      if (!policy) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      const table =
        policy.data_category === "AUDIT_EVENTS"
          ? { name: "audit_events", time: "occurred_at" }
          : policy.data_category === "NOTIFICATIONS"
            ? { name: "notifications", time: "created_at" }
            : { name: "data_jobs", time: "created_at" };
      const cutoff = new Date(Date.now() - policy.retain_for_days * 86400000);
      const counts = await client.query<{
        candidates: string;
        held: string;
        sample_ids: unknown;
      }>(
        `WITH classified AS (
          SELECT x.id,EXISTS(SELECT 1 FROM legal_holds h WHERE h.released_at IS NULL AND h.subject_type=$2 AND (h.subject_ref='*' OR h.subject_ref=x.id::text)) held
          FROM ${table.name} x WHERE x.${table.time}<$1
        ) SELECT count(*) FILTER(WHERE NOT held) candidates,count(*) FILTER(WHERE held) held,
          COALESCE((SELECT jsonb_agg(id) FROM (SELECT id FROM classified WHERE NOT held LIMIT 100)s),'[]') sample_ids
        FROM classified`,
        [cutoff, policy.data_category],
      );
      const count = counts.rows[0]!;
      const result = await client.query<GovernanceRow>(
        `INSERT INTO retention_dry_runs(policy_id,requested_by,cutoff_at,candidate_count,held_count,sample_ids,status) VALUES($1,$2,$3,$4,$5,$6,'DRAFT') RETURNING *`,
        [
          policy.id,
          auth.userId,
          cutoff,
          count.candidates,
          count.held,
          count.sample_ids,
        ],
      );
      await this.evidence(
        client,
        auth.userId,
        "retention.dry_run.created",
        "retention_dry_run",
        result.rows[0]!.id,
        correlationId,
        {
          candidate_count: Number(count.candidates),
          held_count: Number(count.held),
        },
      );
      return result.rows[0];
    });
  }
  async approveDryRun(
    auth: AuthContext,
    correlationId: string,
    id: string,
    body: unknown,
  ) {
    this.admin(auth);
    const input = reasonSchema.parse(body);
    return this.db.transaction(async (client) => {
      const result = await client.query<GovernanceRow>(
        `UPDATE retention_dry_runs SET status='APPROVED',approved_by=$2,approved_at=now(),approval_reason=$3 WHERE id=$1 AND status='DRAFT' RETURNING *`,
        [id, auth.userId, input.reason],
      );
      if (!result.rows[0]) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      await this.evidence(
        client,
        auth.userId,
        "retention.dry_run.approved",
        "retention_dry_run",
        id,
        correlationId,
        { execution_enabled: false },
      );
      return result.rows[0];
    });
  }

  async holds(auth: AuthContext) {
    this.admin(auth);
    return (
      await this.db.query<GovernanceRow>(
        `SELECT * FROM legal_holds ORDER BY created_at DESC LIMIT 100`,
      )
    ).rows;
  }
  async createHold(auth: AuthContext, correlationId: string, body: unknown) {
    this.admin(auth);
    const input = holdSchema.parse(body);
    return this.db.transaction(async (client) => {
      const result = await client.query<GovernanceRow>(
        `INSERT INTO legal_holds(subject_type,subject_ref,reason,approved_by,effective_at) VALUES($1,$2,$3,$4,now()) RETURNING *`,
        [input.subject_type, input.subject_ref, input.reason, auth.userId],
      );
      await this.evidence(
        client,
        auth.userId,
        "legal_hold.created",
        "legal_hold",
        result.rows[0]!.id,
        correlationId,
        { subject_type: input.subject_type, subject_ref: input.subject_ref },
      );
      return result.rows[0];
    });
  }
  async releaseHold(
    auth: AuthContext,
    correlationId: string,
    id: string,
    body: unknown,
  ) {
    this.admin(auth);
    const input = reasonSchema.parse(body);
    return this.db.transaction(async (client) => {
      const result = await client.query<GovernanceRow>(
        `UPDATE legal_holds SET released_at=now(),released_by=$2,release_reason=$3 WHERE id=$1 AND released_at IS NULL RETURNING *`,
        [id, auth.userId, input.reason],
      );
      if (!result.rows[0]) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      await this.evidence(
        client,
        auth.userId,
        "legal_hold.released",
        "legal_hold",
        id,
        correlationId,
        {},
      );
      return result.rows[0];
    });
  }

  async consentPolicies(auth: AuthContext) {
    void auth;
    return (
      await this.db.query<GovernanceRow>(
        `SELECT id,policy_type,version,locale,content,content_hash,published_at FROM consent_policies ORDER BY policy_type,version DESC,locale`,
      )
    ).rows;
  }
  async publishConsent(
    auth: AuthContext,
    correlationId: string,
    body: unknown,
  ) {
    this.admin(auth);
    const input = consentSchema.parse(body);
    const hash = createHash("sha256").update(input.content).digest("hex");
    return this.db.transaction(async (client) => {
      const result = await client.query<GovernanceRow>(
        `INSERT INTO consent_policies(policy_type,version,locale,content_hash,published_at,content,created_by) SELECT $1::varchar,COALESCE(max(version),0)+1,$2::varchar,$3::char(64),now(),$4::text,$5::uuid FROM consent_policies WHERE policy_type=$1::text AND locale=$2::text RETURNING *`,
        [input.policy_type, input.locale, hash, input.content, auth.userId],
      );
      await this.evidence(
        client,
        auth.userId,
        "consent_policy.published",
        "consent_policy",
        result.rows[0]!.id,
        correlationId,
        {
          policy_type: input.policy_type,
          locale: input.locale,
          content_hash: hash,
        },
      );
      return result.rows[0];
    });
  }
  async acceptConsent(
    auth: AuthContext,
    correlationId: string,
    studentId: string,
    policyId: string,
    body: unknown,
  ) {
    const input = evidenceSchema.parse(body);
    await this.studentScope(auth, studentId);
    return this.db.transaction(async (client) => {
      const policy = await client.query<{ id: string }>(
        `SELECT id FROM consent_policies WHERE id=$1`,
        [policyId],
      );
      if (!policy.rows[0]) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      const result = await client.query<GovernanceRow>(
        `INSERT INTO consent_acceptances(policy_id,student_id,accepted_by,accepted_at,evidence_json_redacted) VALUES($1,$2,$3,now(),$4) ON CONFLICT(policy_id,student_id) WHERE withdrawn_at IS NULL DO UPDATE SET evidence_json_redacted=consent_acceptances.evidence_json_redacted RETURNING *`,
        [policyId, studentId, auth.userId, input.evidence],
      );
      await this.evidence(
        client,
        auth.userId,
        "consent.accepted",
        "student",
        studentId,
        correlationId,
        { policy_id: policyId },
      );
      return result.rows[0];
    });
  }
  async withdrawConsent(
    auth: AuthContext,
    correlationId: string,
    studentId: string,
    policyId: string,
    body: unknown,
  ) {
    const input = withdrawalSchema.parse(body);
    await this.studentScope(auth, studentId);
    return this.db.transaction(async (client) => {
      const result = await client.query<GovernanceRow>(
        `UPDATE consent_acceptances SET withdrawn_at=now(),withdrawal_reason=$4 WHERE policy_id=$1 AND student_id=$2 AND accepted_by=$3 AND withdrawn_at IS NULL RETURNING *`,
        [policyId, studentId, auth.userId, input.reason],
      );
      if (!result.rows[0]) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      await this.evidence(
        client,
        auth.userId,
        "consent.withdrawn",
        "student",
        studentId,
        correlationId,
        { policy_id: policyId },
      );
      return result.rows[0];
    });
  }

  private admin(auth: AuthContext) {
    if (!auth.roles.includes("SUPER_ADMIN"))
      throw new DomainError("FORBIDDEN", 403);
  }
  private async studentScope(auth: AuthContext, studentId: string) {
    const unrestricted = auth.roles.some((r) =>
      ["SUPER_ADMIN", "PROGRAM_MANAGER"].includes(r),
    );
    const result = await this.db.query<{ exists: number }>(
      `SELECT 1 exists FROM students WHERE id=$1 AND ($2 OR current_school_id=ANY($3::uuid[]) OR id=$4::uuid)`,
      [studentId, unrestricted, auth.schoolIds, auth.studentId ?? null],
    );
    if (!result.rows[0]) throw new DomainError("RESOURCE_NOT_FOUND", 404);
  }
  private async evidence(
    client: PoolClient,
    actor: string,
    action: string,
    type: string,
    id: string,
    correlation: string,
    after: unknown,
  ) {
    await client.query(
      `INSERT INTO audit_events(actor_id,action,resource_type,resource_id,result,after_redacted,correlation_id) VALUES($1,$2,$3,$4,'SUCCESS',$5,$6)`,
      [actor, action, type, id, after, correlation],
    );
  }
}
