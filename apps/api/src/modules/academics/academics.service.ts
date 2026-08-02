import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import { can, toActor } from "../authorization/policy.js";
import type { AuthContext } from "../identity/session.guard.js";
import {
  approvalTarget,
  assertSeparateReviewers,
  transition,
  type SubmissionState,
} from "./state-machine.js";

const createSchema = z
  .object({
    student_id: z.string().uuid(),
    period_id: z.string().uuid(),
    type: z.string().min(2).max(30),
  })
  .strict();
const draftSchema = z
  .object({ payload: z.record(z.string(), z.unknown()) })
  .strict()
  .refine(
    (value) =>
      Buffer.byteLength(JSON.stringify(value.payload), "utf8") <= 1_048_576,
    "SUBMISSION_PAYLOAD_TOO_LARGE",
  );
const reviewSchema = z
  .object({
    decision: z.enum(["APPROVE", "RETURN", "REJECT"]),
    reason_code: z.string().min(2).max(50).optional(),
    note: z.string().max(2000).optional(),
  })
  .strict();

const responseSchema = z.object({
  id: z.string().uuid(),
  status: z.literal("SCHOOL_REVIEW"),
  version: z.number().int(),
  receipt_code: z.string(),
});
type SubmitResponse = z.infer<typeof responseSchema>;
type ReviewResponse = {
  id: string;
  status: SubmissionState;
  current_version_no: number;
  version: number;
};

@Injectable()
export class AcademicsService {
  constructor(private readonly db: DatabaseService) {}
  async list(auth: AuthContext, queue = false) {
    const actor = toActor(auth);
    const unrestricted = actor.roles.some(
      (role) => role === "SUPER_ADMIN" || role === "PROGRAM_MANAGER",
    );
    const firstSchool = actor.schoolIds[0];
    const mayRead =
      can(actor, "submission.review.final", {}) ||
      can(
        actor,
        "submission.review.school",
        firstSchool ? { schoolId: firstSchool } : {},
      ) ||
      !!actor.studentId;
    if (!mayRead) throw new DomainError("RESOURCE_NOT_FOUND", 404);
    const mayReviewSchool = can(
      actor,
      "submission.review.school",
      firstSchool ? { schoolId: firstSchool } : {},
    );
    const mayReviewFinal = can(actor, "submission.review.final", {});
    return (
      await this.db.query(
        `SELECT a.id,a.student_id,a.period_id,a.type,a.status,a.current_version_no,a.version,
              s.student_code,s.full_name,s.current_school_id,p.code period_code,p.workflow_type
       FROM academic_submissions a JOIN students s ON s.id=a.student_id JOIN academic_periods p ON p.id=a.period_id
       WHERE ($1::boolean OR s.current_school_id=ANY($2::uuid[]) OR s.id=$3::uuid)
         AND (NOT $4::boolean OR (a.status='SCHOOL_REVIEW' AND $5::boolean) OR (a.status='PROGRAM_REVIEW' AND $6::boolean))
       ORDER BY p.due_at,a.updated_at`,
        [
          unrestricted,
          actor.schoolIds,
          actor.studentId ?? null,
          queue,
          mayReviewSchool,
          mayReviewFinal,
        ],
      )
    ).rows;
  }
  async create(auth: AuthContext, input: unknown) {
    const value = createSchema.parse(input);
    const student = await this.db.query<{ current_school_id: string }>(
      `SELECT s.current_school_id FROM students s JOIN academic_periods p ON p.id=$2 AND p.program_id=s.program_id
       WHERE s.id=$1 AND (p.opens_at IS NULL OR p.opens_at<=now()) AND p.due_at>=now()`,
      [value.student_id, value.period_id],
    );
    if (
      !student.rows[0] ||
      !can(toActor(auth), "submission.submit", {
        studentId: value.student_id,
        schoolId: student.rows[0].current_school_id,
      })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    try {
      return (
        await this.db.query(
          `INSERT INTO academic_submissions(student_id,period_id,type,status,created_by) VALUES($1,$2,$3,'DRAFT',$4)
         RETURNING id,student_id,period_id,type,status,current_version_no,version`,
          [value.student_id, value.period_id, value.type, auth.userId],
        )
      ).rows[0];
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        String((error as { code: unknown }).code) === "23505"
      )
        throw new DomainError("SUBMISSION_DUPLICATE", 409);
      throw error;
    }
  }
  async saveDraft(
    auth: AuthContext,
    id: string,
    etag: string | undefined,
    input: unknown,
  ) {
    const expected = parseEtag(etag);
    const value = draftSchema.parse(input);
    const resource = await this.resource(id);
    if (
      !can(toActor(auth), "submission.submit", {
        studentId: resource.student_id,
        schoolId: resource.school_id,
      })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    if (!["DRAFT", "RETURNED"].includes(resource.status))
      throw new DomainError("INVALID_STATE_TRANSITION", 409);
    const result = await this.db.query(
      `UPDATE academic_submissions SET draft_payload_json=$3,version=version+1,updated_at=now() WHERE id=$1 AND version=$2
       RETURNING id,status,current_version_no,version,draft_payload_json`,
      [id, expected, JSON.stringify(value.payload)],
    );
    if (!result.rows[0]) throw new DomainError("VERSION_CONFLICT", 412);
    return result.rows[0];
  }
  private async resource(id: string) {
    const result = await this.db.query<{
      student_id: string;
      school_id: string;
      status: string;
    }>(
      `SELECT a.student_id,s.current_school_id school_id,a.status FROM academic_submissions a JOIN students s ON s.id=a.student_id WHERE a.id=$1`,
      [id],
    );
    if (!result.rows[0]) throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return result.rows[0];
  }
  async submit(
    auth: AuthContext,
    id: string,
    key: string | undefined,
    version: number | undefined,
  ): Promise<SubmitResponse> {
    if (!key) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", 400);
    if (!version) throw new DomainError("PRECONDITION_REQUIRED", 428);
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ id, version }))
      .digest("hex");
    return this.db.transaction(async (client): Promise<SubmitResponse> => {
      const cached = await client.query<{
        response_body_ref: string;
        request_hash: string;
      }>(
        `SELECT response_body_ref,request_hash FROM idempotency_records WHERE actor_id=$1 AND operation='SUBMIT' AND key=$2`,
        [auth.userId, key],
      );
      if (cached.rows[0] && cached.rows[0].request_hash !== requestHash)
        throw new DomainError("IDEMPOTENCY_KEY_REUSED", 409);
      if (cached.rows[0])
        return responseSchema.parse(
          JSON.parse(cached.rows[0].response_body_ref) as unknown,
        );
      const locked = await client.query<{
        student_id: string;
        school_id: string;
        period_id: string;
        status: string;
        version: number;
        current_version_no: number;
        draft_payload_json: Record<string, unknown>;
      }>(
        `SELECT a.student_id,a.period_id,a.status,a.version,a.current_version_no,a.draft_payload_json,s.current_school_id school_id
         FROM academic_submissions a JOIN students s ON s.id=a.student_id WHERE a.id=$1 FOR UPDATE OF a`,
        [id],
      );
      const submission = locked.rows[0];
      if (!submission) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      if (
        !can(toActor(auth), "submission.submit", {
          studentId: submission.student_id,
          schoolId: submission.school_id,
        })
      )
        throw new DomainError("RESOURCE_NOT_FOUND", 404);
      if (submission.version !== version)
        throw new DomainError("VERSION_CONFLICT", 412);
      if (!["DRAFT", "RETURNED"].includes(submission.status))
        throw new DomainError("INVALID_STATE_TRANSITION", 409);
      const unsafe = await client.query(
        `SELECT 1 FROM document_links dl JOIN documents d ON d.id=dl.document_id WHERE dl.owner_type='SUBMISSION' AND dl.owner_id=$1 AND d.scan_status<>'CLEAN' LIMIT 1`,
        [id],
      );
      if (unsafe.rowCount) throw new DomainError("FILE_NOT_CLEAN", 422);
      const period = await client.query<{ due_at: Date }>(
        `SELECT due_at FROM academic_periods WHERE id=$1`,
        [submission.period_id],
      );
      if (!period.rows[0] || period.rows[0].due_at < new Date())
        throw new DomainError("DEADLINE_EXPIRED", 422);
      const next = submission.current_version_no + 1;
      await client.query(
        `INSERT INTO submission_versions(submission_id,version_no,payload_json) VALUES($1,$2,$3)`,
        [id, next, JSON.stringify(submission.draft_payload_json)],
      );
      await client.query(
        `UPDATE academic_submissions SET status='SCHOOL_REVIEW',current_version_no=$2,version=version+1,submitted_by=$3,updated_at=now() WHERE id=$1`,
        [id, next, auth.userId],
      );
      await client.query(
        `INSERT INTO review_tasks(submission_id,level,status,due_at) VALUES($1,1,'OPEN',now()+interval '3 days')`,
        [id],
      );
      const response: SubmitResponse = {
        id,
        status: "SCHOOL_REVIEW",
        version: version + 1,
        receipt_code: `VNSF-${id.slice(0, 8).toUpperCase()}-${next}`,
      };
      await client.query(
        `INSERT INTO idempotency_records(actor_id,operation,key,request_hash,response_status,response_body_ref,expires_at) VALUES($1,'SUBMIT',$2,$3,200,$4,now()+interval '24 hours')`,
        [auth.userId, key, requestHash, JSON.stringify(response)],
      );
      await client.query(
        `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload) VALUES('SUBMISSION',$1,'submission.submitted',$2)`,
        [id, JSON.stringify({ submission_id: id })],
      );
      return response;
    });
  }
  async review(
    auth: AuthContext,
    id: string,
    etag: string | undefined,
    input: unknown,
  ) {
    const expected = parseEtag(etag);
    const value = reviewSchema.parse(input);
    return this.db.transaction<ReviewResponse>(async (client) => {
      const locked = await client.query<{
        status: SubmissionState;
        version: number;
        student_id: string;
        school_id: string;
        workflow_type: "ONE_LEVEL" | "TWO_LEVEL";
      }>(
        `SELECT a.status,a.version,a.student_id,s.current_school_id school_id,p.workflow_type
          FROM academic_submissions a JOIN students s ON s.id=a.student_id JOIN academic_periods p ON p.id=a.period_id
          WHERE a.id=$1 FOR UPDATE OF a`,
        [id],
      );
      const submission = locked.rows[0];
      if (!submission) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      if (submission.version !== expected)
        throw new DomainError("VERSION_CONFLICT", 412);
      const actor = toActor(auth);
      const level =
        submission.status === "SCHOOL_REVIEW"
          ? 1
          : submission.status === "PROGRAM_REVIEW"
            ? 2
            : 0;
      const action =
        level === 1 ? "submission.review.school" : "submission.review.final";
      if (
        !level ||
        !can(actor, action, {
          studentId: submission.student_id,
          schoolId: submission.school_id,
        })
      )
        throw new DomainError("RESOURCE_NOT_FOUND", 404);
      const task = await client.query<{ id: string }>(
        `SELECT id FROM review_tasks WHERE submission_id=$1 AND level=$2 AND status='OPEN' FOR UPDATE`,
        [id, level],
      );
      if (!task.rows[0]) throw new DomainError("REVIEW_TASK_NOT_OPEN", 409);
      if (level === 2) {
        const first = await client.query<{ reviewer_id: string }>(
          `SELECT reviewer_id FROM review_tasks WHERE submission_id=$1 AND level=1 AND status='APPROVED'`,
          [id],
        );
        if (first.rows[0])
          assertSeparateReviewers(first.rows[0].reviewer_id, auth.userId);
      }
      const reason = value.note ?? value.reason_code;
      const target: SubmissionState =
        value.decision === "RETURN"
          ? "RETURNED"
          : value.decision === "REJECT"
            ? "REJECTED"
            : approvalTarget(level, submission.workflow_type);
      transition(submission.status, target, reason);
      const taskStatus =
        value.decision === "APPROVE"
          ? "APPROVED"
          : value.decision === "RETURN"
            ? "RETURNED"
            : "REJECTED";
      await client.query(
        `UPDATE review_tasks SET status=$2,reviewer_id=$3,reason_code=$4,note=$5,completed_at=now(),version=version+1 WHERE id=$1`,
        [
          task.rows[0].id,
          taskStatus,
          auth.userId,
          value.reason_code ?? null,
          value.note ?? null,
        ],
      );
      if (target === "PROGRAM_REVIEW")
        await client.query(
          `INSERT INTO review_tasks(submission_id,level,status,due_at) VALUES($1,2,'OPEN',now()+interval '3 days')`,
          [id],
        );
      const result = await client.query<ReviewResponse>(
        `UPDATE academic_submissions SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,status,current_version_no,version`,
        [id, target],
      );
      await client.query(
        `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload) VALUES('SUBMISSION',$1,$2,$3)`,
        [
          id,
          `submission.${target.toLowerCase()}`,
          JSON.stringify({ submission_id: id, status: target }),
        ],
      );
      return result.rows[0]!;
    });
  }
}
function parseEtag(etag: string | undefined) {
  if (!etag) throw new DomainError("PRECONDITION_REQUIRED", 428);
  const value = Number(etag.replaceAll('"', ""));
  if (!Number.isInteger(value))
    throw new DomainError("PRECONDITION_INVALID", 400);
  return value;
}
