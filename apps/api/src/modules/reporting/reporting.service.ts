import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import type { AuthContext } from "../identity/session.guard.js";
import { ObjectStorageService } from "../documents/object-storage.service.js";

const uuid = z.string().uuid();
const exportSchema = z.object({
  resource_type: z.enum(["STUDENTS", "SUBMISSIONS", "TRANSFERS"]),
  school_id: uuid.optional(),
});
const studentRow = z.object({
  student_code: z.string().trim().min(1).max(30),
  full_name: z.string().trim().min(2).max(150),
  date_of_birth: z.string().date(),
  program_id: uuid,
  current_school_id: uuid,
  grade_level_current: z.number().int().min(1).max(12).nullable().optional(),
});
const importSchema = z.object({ rows: z.array(studentRow).min(1).max(1000) });
type JobRow = {
  id: string;
  kind: string;
  resource_type: string;
  status: string;
  result_object_key: string | null;
  result_summary: unknown;
  error_code: string | null;
  created_at: Date;
  completed_at: Date | null;
};

@Injectable()
export class ReportingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: ObjectStorageService,
  ) {}

  async dashboard(auth: AuthContext) {
    const scope = this.scope(auth);
    const result = await this.db.query<{
      students: string;
      active_students: string;
      pending_submissions: string;
      approved_submissions: string;
      pending_transfers: string;
      unread_notifications: string;
    }>(
      `SELECT
       (SELECT count(*) FROM students s WHERE ($1 OR s.current_school_id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR s.id=$3)) students,
       (SELECT count(*) FROM students s WHERE s.status='ACTIVE' AND ($1 OR s.current_school_id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR s.id=$3)) active_students,
       (SELECT count(*) FROM academic_submissions a JOIN students s ON s.id=a.student_id WHERE a.status IN('DRAFT','RETURNED','SCHOOL_REVIEW','PROGRAM_REVIEW') AND ($1 OR s.current_school_id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR s.id=$3)) pending_submissions,
       (SELECT count(*) FROM academic_submissions a JOIN students s ON s.id=a.student_id WHERE a.status IN('APPROVED','LOCKED') AND ($1 OR s.current_school_id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR s.id=$3)) approved_submissions,
       (SELECT count(*) FROM manual_transfers m JOIN students s ON s.id=m.student_id WHERE m.status IN('PENDING_TRANSFER','AWAITING_CONFIRMATION','NOT_RECEIVED','UNDER_INVESTIGATION') AND ($1 OR s.current_school_id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR s.id=$3)) pending_transfers,
       (SELECT count(*) FROM notifications n WHERE n.user_id=$4 AND n.read_at IS NULL) unread_notifications`,
      [scope.unrestricted, scope.schoolIds, scope.studentId, auth.userId],
    );
    const row = result.rows[0]!;
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, Number(value)]),
    );
  }

  async summary(auth: AuthContext, schoolId?: string) {
    const scope = this.managerScope(auth, schoolId);
    const result = await this.db.query(
      `SELECT sc.id school_id,sc.code school_code,sc.name school_name,
       (SELECT count(*)::int FROM students s WHERE s.current_school_id=sc.id) students,
       (SELECT count(*)::int FROM academic_submissions a JOIN students s ON s.id=a.student_id WHERE s.current_school_id=sc.id AND a.status IN('APPROVED','LOCKED')) approved_submissions,
       (SELECT count(*)::int FROM academic_submissions a JOIN students s ON s.id=a.student_id WHERE s.current_school_id=sc.id AND a.status IN('DRAFT','RETURNED','SCHOOL_REVIEW','PROGRAM_REVIEW')) pending_submissions,
       (SELECT COALESCE(sum(m.amount),0)::text FROM manual_transfers m JOIN students s ON s.id=m.student_id WHERE s.current_school_id=sc.id AND m.status<>'CORRECTED' AND m.currency='VND') transferred_vnd,
       (SELECT COALESCE(sum(m.amount),0)::text FROM manual_transfers m JOIN students s ON s.id=m.student_id WHERE s.current_school_id=sc.id AND m.status<>'CORRECTED' AND m.currency='USD') transferred_usd
       FROM schools sc WHERE ($1 OR sc.id=ANY($2::uuid[])) ORDER BY sc.code`,
      [scope.unrestricted, scope.schoolIds],
    );
    return result.rows;
  }

  async createExport(
    auth: AuthContext,
    key: string | undefined,
    body: unknown,
  ) {
    const input = exportSchema.parse(body);
    const scope = this.managerScope(auth, input.school_id);
    return this.createJob(
      auth,
      key,
      "EXPORT",
      input.resource_type,
      input,
      null,
      scope.schoolIds,
      "data.export.requested",
    );
  }

  async createStudentImport(
    auth: AuthContext,
    key: string | undefined,
    body: unknown,
  ) {
    const input = importSchema.parse(body);
    const scope = this.managerScope(auth);
    for (const row of input.rows) {
      if (
        !scope.unrestricted &&
        !scope.schoolIds.includes(row.current_school_id)
      )
        throw new DomainError("RESOURCE_NOT_FOUND", 404);
    }
    return this.createJob(
      auth,
      key,
      "IMPORT",
      "STUDENTS",
      {},
      input.rows,
      scope.schoolIds,
      "data.import.validate",
    );
  }

  async confirmImport(auth: AuthContext, id: string, key: string | undefined) {
    this.managerScope(auth);
    if (!key?.trim()) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", 400);
    return this.db.transaction(async (client) => {
      const result = await client.query<
        JobRow & { parameters: { confirm_key?: string } }
      >(`SELECT * FROM data_jobs WHERE id=$1 AND requested_by=$2 FOR UPDATE`, [
        id,
        auth.userId,
      ]);
      const job = result.rows[0];
      if (!job) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      if (job.parameters.confirm_key === key.trim()) return this.present(job);
      if (job.kind !== "IMPORT" || job.status !== "VALIDATED")
        throw new DomainError("INVALID_STATE_TRANSITION", 409);
      await client.query(
        `UPDATE data_jobs SET status='QUEUED',confirmed_by=$2,confirmed_at=now(),updated_at=now(),parameters=parameters||jsonb_build_object('confirm_key',$3::text) WHERE id=$1`,
        [id, auth.userId, key.trim()],
      );
      await client.query(
        `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload) VALUES('DATA_JOB',$1::uuid,'data.import.confirmed',jsonb_build_object('job_id',$1::text))`,
        [id],
      );
      return { ...job, status: "QUEUED" };
    });
  }

  async listJobs(auth: AuthContext) {
    const manager = auth.roles.some((role) =>
      ["SUPER_ADMIN", "PROGRAM_MANAGER", "SCHOOL_MANAGER"].includes(role),
    );
    if (!manager) throw new DomainError("FORBIDDEN", 403);
    const result = await this.db.query<JobRow>(
      `SELECT id,kind,resource_type,status,result_summary,error_code,created_at,completed_at,result_object_key FROM data_jobs WHERE requested_by=$1 ORDER BY created_at DESC LIMIT 100`,
      [auth.userId],
    );
    return Promise.all(result.rows.map((row) => this.present(row)));
  }

  async getJob(auth: AuthContext, id: string) {
    const result = await this.db.query<JobRow>(
      `SELECT id,kind,resource_type,status,result_summary,error_code,created_at,completed_at,result_object_key FROM data_jobs WHERE id=$1 AND requested_by=$2`,
      [id, auth.userId],
    );
    if (!result.rows[0]) throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return this.present(result.rows[0]);
  }

  private async createJob(
    auth: AuthContext,
    key: string | undefined,
    kind: string,
    resource: string,
    parameters: unknown,
    rows: unknown,
    schools: string[],
    event: string,
  ) {
    if (!key?.trim()) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", 400);
    const hash = createHash("sha256")
      .update(JSON.stringify({ kind, resource, parameters, rows }))
      .digest("hex");
    return this.db.transaction(async (client) => {
      const existing = await client.query<JobRow & { request_hash: string }>(
        `SELECT * FROM data_jobs WHERE requested_by=$1 AND kind=$2 AND idempotency_key=$3`,
        [auth.userId, kind, key.trim()],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== hash)
          throw new DomainError("IDEMPOTENCY_CONFLICT", 409);
        return this.present(existing.rows[0]);
      }
      const result = await client.query<JobRow>(
        `INSERT INTO data_jobs(kind,resource_type,requested_by,school_scope_ids,parameters,source_rows,status,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,'QUEUED',$7,$8) RETURNING *`,
        [
          kind,
          resource,
          auth.userId,
          schools,
          parameters,
          rows,
          key.trim(),
          hash,
        ],
      );
      await client.query(
        `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload) VALUES('DATA_JOB',$1::uuid,$2::text,jsonb_build_object('job_id',$1::text))`,
        [result.rows[0]!.id, event],
      );
      return this.present(result.rows[0]!);
    });
  }

  private async present(row: JobRow) {
    const { result_object_key, ...safe } = row;
    return {
      ...safe,
      ...(row.status === "COMPLETED" && result_object_key
        ? { download_url: await this.storage.downloadUrl(result_object_key) }
        : {}),
    };
  }

  private scope(auth: AuthContext) {
    return {
      unrestricted: auth.roles.some((r) =>
        ["SUPER_ADMIN", "PROGRAM_MANAGER"].includes(r),
      ),
      schoolIds: auth.schoolIds,
      studentId: auth.roles.includes("STUDENT")
        ? (auth.studentId ?? null)
        : null,
    };
  }

  private managerScope(auth: AuthContext, requestedSchool?: string) {
    const scope = this.scope(auth);
    if (
      !auth.roles.some((r) =>
        ["SUPER_ADMIN", "PROGRAM_MANAGER", "SCHOOL_MANAGER"].includes(r),
      )
    )
      throw new DomainError("FORBIDDEN", 403);
    if (
      requestedSchool &&
      !scope.unrestricted &&
      !scope.schoolIds.includes(requestedSchool)
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return {
      ...scope,
      schoolIds: requestedSchool ? [requestedSchool] : scope.schoolIds,
    };
  }
}
