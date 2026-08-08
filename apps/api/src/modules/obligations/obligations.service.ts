import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import { can, toActor } from "../authorization/policy.js";
import type { AuthContext } from "../identity/session.guard.js";

const extensionSchema = z
  .object({
    reason: z.string().trim().min(10).max(2000),
    proposed_due_at: z.string().datetime({ offset: true }),
  })
  .strict();
const extensionDecisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().min(5).max(2000),
  })
  .strict();
const createLetterSchema = z
  .object({
    student_id: z.string().uuid(),
    period_id: z.string().uuid(),
    content: z.string().trim().min(20).max(20000).default(""),
  })
  .strict();
const contentSchema = z
  .object({ content: z.string().trim().min(20).max(20000) })
  .strict();
const reviewSchema = z
  .object({
    decision: z.enum(["APPROVE", "RETURN", "REJECT"]),
    reason_code: z.string().trim().min(2).max(50).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((v) => v.decision === "APPROVE" || !!v.reason_code, {
    message: "REASON_CODE_REQUIRED",
    path: ["reason_code"],
  });

type Resource = { student_id: string; school_id: string };
type ExtensionRow = {
  id: string;
  obligation_id: string;
  reason: string;
  original_due_at: Date;
  proposed_due_at: Date;
  status: string;
  decision_reason?: string | null;
  version: number;
  created_at?: Date;
  decided_at?: Date | null;
};
type LetterRow = {
  id: string;
  student_id?: string;
  period_id?: string;
  status: string;
  draft_content?: string;
  current_version_no: number;
  version: number;
};

@Injectable()
export class ObligationsService {
  constructor(private readonly db: DatabaseService) {}

  async listExtensions(auth: AuthContext) {
    const actor = toActor(auth);
    const unrestricted = actor.roles.some(
      (r) => r === "SUPER_ADMIN" || r === "PROGRAM_MANAGER",
    );
    if (!unrestricted && !actor.studentId && actor.schoolIds.length === 0)
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return (
      await this.db.query<
        ExtensionRow & { student_code: string; full_name: string }
      >(
        `SELECT e.id,e.obligation_id,e.reason,e.original_due_at,e.proposed_due_at,e.status,
              e.decision_reason,e.version,e.created_at,a.type obligation_type,s.id student_id,
              s.student_code,s.full_name,s.current_school_id
       FROM extension_requests e
       JOIN academic_submissions a ON a.id=e.obligation_id
       JOIN students s ON s.id=a.student_id
       WHERE ($1::boolean OR s.current_school_id=ANY($2::uuid[]) OR s.id=$3::uuid)
       ORDER BY e.created_at DESC`,
        [unrestricted, actor.schoolIds, actor.studentId ?? null],
      )
    ).rows;
  }

  async requestExtension(
    auth: AuthContext,
    obligationId: string,
    input: unknown,
  ) {
    const value = extensionSchema.parse(input);
    return this.db.transaction(async (client) => {
      const found = await client.query<
        Resource & { status: string; effective_due_at: Date }
      >(
        `SELECT a.student_id,s.current_school_id school_id,a.status,a.effective_due_at
         FROM academic_submissions a JOIN students s ON s.id=a.student_id
         WHERE a.id=$1 FOR UPDATE OF a`,
        [obligationId],
      );
      const obligation = found.rows[0];
      if (
        !obligation ||
        !can(toActor(auth), "extension.request", {
          studentId: obligation.student_id,
          schoolId: obligation.school_id,
        })
      )
        throw new DomainError("RESOURCE_NOT_FOUND", 404);
      if (["APPROVED", "LOCKED"].includes(obligation.status))
        throw new DomainError("INVALID_STATE_TRANSITION", 409);
      const proposed = new Date(value.proposed_due_at);
      if (proposed <= obligation.effective_due_at)
        throw new DomainError("EXTENSION_DEADLINE_INVALID", 422);
      try {
        const result = await client.query<ExtensionRow>(
          `INSERT INTO extension_requests(obligation_id,requested_by,reason,original_due_at,proposed_due_at,status)
           VALUES($1,$2,$3,$4,$5,'REQUESTED')
           RETURNING id,obligation_id,reason,original_due_at,proposed_due_at,status,version,created_at`,
          [
            obligationId,
            auth.userId,
            value.reason,
            obligation.effective_due_at,
            proposed,
          ],
        );
        const created = result.rows[0];
        if (!created) throw new DomainError("INTERNAL_ERROR", 500);
        await client.query(
          `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload)
           VALUES('EXTENSION',$1,'extension.requested',$2)`,
          [
            created.id,
            JSON.stringify({
              extension_id: created.id,
              obligation_id: obligationId,
            }),
          ],
        );
        return created;
      } catch (error) {
        if ((error as { code?: string }).code === "23505")
          throw new DomainError("EXTENSION_ALREADY_OPEN", 409);
        throw error;
      }
    });
  }

  async decideExtension(
    auth: AuthContext,
    id: string,
    etag: string | undefined,
    input: unknown,
  ) {
    const expected = parseEtag(etag);
    const value = extensionDecisionSchema.parse(input);
    if (!can(toActor(auth), "extension.decide", {}))
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return this.db.transaction(async (client) => {
      const found = await client.query<{
        obligation_id: string;
        proposed_due_at: Date;
        status: string;
        version: number;
      }>(
        `SELECT obligation_id,proposed_due_at,status,version FROM extension_requests WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const request = found.rows[0];
      if (!request) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      if (request.version !== expected)
        throw new DomainError("VERSION_CONFLICT", 412);
      if (request.status !== "REQUESTED")
        throw new DomainError("INVALID_STATE_TRANSITION", 409);
      const status = value.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      const result = await client.query<ExtensionRow>(
        `UPDATE extension_requests SET status=$2,decision_reason=$3,decided_by=$4,decided_at=now(),version=version+1
         WHERE id=$1 RETURNING id,obligation_id,status,proposed_due_at,decision_reason,version,decided_at`,
        [id, status, value.reason, auth.userId],
      );
      if (status === "APPROVED")
        await client.query(
          `UPDATE academic_submissions SET effective_due_at=$2,version=version+1,updated_at=now() WHERE id=$1`,
          [request.obligation_id, request.proposed_due_at],
        );
      await client.query(
        `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload)
         VALUES('EXTENSION',$1,$2,$3)`,
        [
          id,
          status === "APPROVED"
            ? "extension.approved.reminders_reschedule"
            : "extension.rejected",
          JSON.stringify({
            extension_id: id,
            obligation_id: request.obligation_id,
            effective_due_at: request.proposed_due_at,
          }),
        ],
      );
      return result.rows[0];
    });
  }

  async listLetters(auth: AuthContext, queue: boolean) {
    const actor = toActor(auth);
    const unrestricted = actor.roles.some(
      (r) => r === "SUPER_ADMIN" || r === "PROGRAM_MANAGER",
    );
    const schoolReview = actor.roles.includes("SCHOOL_MANAGER") || unrestricted;
    return (
      await this.db.query<
        LetterRow & { student_code: string; full_name: string }
      >(
        `SELECT l.id,l.student_id,l.period_id,l.status,l.draft_content,l.current_version_no,l.version,
              s.student_code,s.full_name,s.current_school_id,p.code period_code,p.workflow_type
       FROM thank_you_letters l JOIN students s ON s.id=l.student_id JOIN academic_periods p ON p.id=l.period_id
       WHERE ($1::boolean OR s.current_school_id=ANY($2::uuid[]) OR s.id=$3::uuid)
         AND (NOT $4::boolean OR (l.status='SCHOOL_REVIEW' AND $5::boolean) OR (l.status='PROGRAM_REVIEW' AND $1::boolean))
       ORDER BY l.updated_at DESC`,
        [
          unrestricted,
          actor.schoolIds,
          actor.studentId ?? null,
          queue,
          schoolReview,
        ],
      )
    ).rows;
  }

  async createLetter(auth: AuthContext, input: unknown) {
    const value = createLetterSchema.parse(input);
    const resource = await this.studentPeriod(
      value.student_id,
      value.period_id,
    );
    if (
      !resource ||
      !can(toActor(auth), "thankyou.submit", {
        studentId: resource.student_id,
        schoolId: resource.school_id,
      })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    try {
      return (
        await this.db.query<LetterRow>(
          `INSERT INTO thank_you_letters(student_id,period_id,draft_content,created_by)
         VALUES($1,$2,$3,$4) RETURNING id,student_id,period_id,status,draft_content,current_version_no,version`,
          [value.student_id, value.period_id, value.content, auth.userId],
        )
      ).rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new DomainError("THANK_YOU_EXISTS", 409);
      throw error;
    }
  }

  async saveLetter(
    auth: AuthContext,
    id: string,
    etag: string | undefined,
    input: unknown,
  ) {
    const expected = parseEtag(etag);
    const value = contentSchema.parse(input);
    const resource = await this.letterResource(id);
    if (
      !resource ||
      !can(toActor(auth), "thankyou.submit", {
        studentId: resource.student_id,
        schoolId: resource.school_id,
      })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    if (!["DRAFT", "RETURNED"].includes(resource.status))
      throw new DomainError("INVALID_STATE_TRANSITION", 409);
    const result = await this.db.query<LetterRow>(
      `UPDATE thank_you_letters SET draft_content=$3,version=version+1,updated_at=now()
       WHERE id=$1 AND version=$2 RETURNING id,status,draft_content,current_version_no,version`,
      [id, expected, value.content],
    );
    if (!result.rows[0]) throw new DomainError("VERSION_CONFLICT", 412);
    return result.rows[0];
  }

  async submitLetter(auth: AuthContext, id: string, etag: string | undefined) {
    const expected = parseEtag(etag);
    return this.db.transaction(async (client) => {
      const found = await client.query<
        Resource & {
          status: string;
          version: number;
          current_version_no: number;
          draft_content: string;
        }
      >(
        `SELECT l.student_id,s.current_school_id school_id,l.status,l.version,l.current_version_no,l.draft_content
         FROM thank_you_letters l JOIN students s ON s.id=l.student_id WHERE l.id=$1 FOR UPDATE OF l`,
        [id],
      );
      const letter = found.rows[0];
      if (
        !letter ||
        !can(toActor(auth), "thankyou.submit", {
          studentId: letter.student_id,
          schoolId: letter.school_id,
        })
      )
        throw new DomainError("RESOURCE_NOT_FOUND", 404);
      if (letter.version !== expected)
        throw new DomainError("VERSION_CONFLICT", 412);
      if (!["DRAFT", "RETURNED"].includes(letter.status))
        throw new DomainError("INVALID_STATE_TRANSITION", 409);
      if (letter.draft_content.trim().length < 20)
        throw new DomainError("THANK_YOU_CONTENT_REQUIRED", 422);
      const unsafe = await client.query(
        `SELECT 1 FROM document_links dl JOIN documents d ON d.id=dl.document_id
         WHERE dl.owner_type='THANK_YOU_LETTER' AND dl.owner_id=$1 AND d.scan_status<>'CLEAN' LIMIT 1`,
        [id],
      );
      if (unsafe.rowCount) throw new DomainError("FILE_NOT_CLEAN", 422);
      const next = letter.current_version_no + 1;
      await client.query(
        `INSERT INTO thank_you_letter_versions(letter_id,version_no,content,submitted_by) VALUES($1,$2,$3,$4)`,
        [id, next, letter.draft_content, auth.userId],
      );
      const result = await client.query<LetterRow>(
        `UPDATE thank_you_letters SET status='SCHOOL_REVIEW',submitted_by=$2,current_version_no=$3,
           version=version+1,updated_at=now() WHERE id=$1 RETURNING id,status,current_version_no,version`,
        [id, auth.userId, next],
      );
      await client.query(
        `INSERT INTO thank_you_review_tasks(letter_id,level,status,due_at) VALUES($1,1,'OPEN',now()+interval '3 days')`,
        [id],
      );
      await client.query(
        `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload) VALUES('THANK_YOU',$1,'thank_you.submitted',$2)`,
        [id, JSON.stringify({ letter_id: id, version_no: next })],
      );
      return result.rows[0];
    });
  }

  async reviewLetter(
    auth: AuthContext,
    id: string,
    etag: string | undefined,
    input: unknown,
  ) {
    const expected = parseEtag(etag);
    const value = reviewSchema.parse(input);
    return this.db.transaction(async (client) => {
      const found = await client.query<
        Resource & { status: string; version: number; workflow_type: string }
      >(
        `SELECT l.student_id,s.current_school_id school_id,l.status,l.version,p.workflow_type
         FROM thank_you_letters l JOIN students s ON s.id=l.student_id JOIN academic_periods p ON p.id=l.period_id
         WHERE l.id=$1 FOR UPDATE OF l`,
        [id],
      );
      const letter = found.rows[0];
      if (!letter) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      if (letter.version !== expected)
        throw new DomainError("VERSION_CONFLICT", 412);
      const level =
        letter.status === "SCHOOL_REVIEW"
          ? 1
          : letter.status === "PROGRAM_REVIEW"
            ? 2
            : 0;
      const action =
        level === 1 ? "thankyou.review.school" : "thankyou.review.final";
      if (
        !level ||
        !can(toActor(auth), action, {
          studentId: letter.student_id,
          schoolId: letter.school_id,
        })
      )
        throw new DomainError("RESOURCE_NOT_FOUND", 404);
      if (level === 2) {
        const first = await client.query<{ reviewer_id: string }>(
          `SELECT reviewer_id FROM thank_you_review_tasks WHERE letter_id=$1 AND level=1 AND status='APPROVED'`,
          [id],
        );
        if (first.rows[0]?.reviewer_id === auth.userId)
          throw new DomainError("REVIEWER_SEPARATION_REQUIRED", 409);
      }
      const taskStatus =
        value.decision === "APPROVE"
          ? "APPROVED"
          : value.decision === "RETURN"
            ? "RETURNED"
            : "REJECTED";
      let target = taskStatus;
      if (value.decision === "APPROVE")
        target =
          level === 1 && letter.workflow_type === "TWO_LEVEL"
            ? "PROGRAM_REVIEW"
            : "APPROVED";
      await client.query(
        `UPDATE thank_you_review_tasks SET status=$3,reviewer_id=$4,reason_code=$5,note=$6,completed_at=now()
         WHERE letter_id=$1 AND level=$2 AND status='OPEN'`,
        [
          id,
          level,
          taskStatus,
          auth.userId,
          value.reason_code ?? null,
          value.note ?? null,
        ],
      );
      if (target === "PROGRAM_REVIEW")
        await client.query(
          `INSERT INTO thank_you_review_tasks(letter_id,level,status,due_at) VALUES($1,2,'OPEN',now()+interval '3 days')`,
          [id],
        );
      const result = await client.query<LetterRow>(
        `UPDATE thank_you_letters SET status=$2,version=version+1,updated_at=now() WHERE id=$1
         RETURNING id,status,current_version_no,version`,
        [id, target],
      );
      await client.query(
        `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload) VALUES('THANK_YOU',$1,$2,$3)`,
        [
          id,
          `thank_you.${target.toLowerCase()}`,
          JSON.stringify({ letter_id: id, status: target }),
        ],
      );
      return result.rows[0];
    });
  }

  private async studentPeriod(studentId: string, periodId: string) {
    return (
      await this.db.query<Resource>(
        `SELECT s.id student_id,s.current_school_id school_id FROM students s
       JOIN academic_periods p ON p.id=$2 AND p.program_id=s.program_id WHERE s.id=$1`,
        [studentId, periodId],
      )
    ).rows[0];
  }
  private async letterResource(id: string) {
    return (
      await this.db.query<Resource & { status: string }>(
        `SELECT l.student_id,s.current_school_id school_id,l.status FROM thank_you_letters l
       JOIN students s ON s.id=l.student_id WHERE l.id=$1`,
        [id],
      )
    ).rows[0];
  }
}

function parseEtag(etag: string | undefined) {
  if (!etag) throw new DomainError("PRECONDITION_REQUIRED", 428);
  const value = Number(etag.replaceAll('"', ""));
  if (!Number.isInteger(value) || value < 1)
    throw new DomainError("PRECONDITION_INVALID", 400);
  return value;
}
