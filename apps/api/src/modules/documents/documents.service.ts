import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import { can, toActor } from "../authorization/policy.js";
import type { AuthContext } from "../identity/session.guard.js";
import { ObjectStorageService } from "./object-storage.service.js";

const allowedMime = new Set(["application/pdf", "image/jpeg", "image/png"]);
const initSchema = z
  .object({
    owner_type: z.enum(["STUDENT", "SUBMISSION", "EDUCATION_EXPENSE"]),
    owner_id: z.string().uuid(),
    purpose: z.string().min(2).max(40),
    filename: z.string().min(1).max(255),
    size_bytes: z.number().int().min(1).max(10_485_760),
    mime_type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
    checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
type DocumentRow = {
  id: string;
  object_key: string;
  promoted_key: string | null;
  checksum: string;
  size_bytes: string;
  mime_type: string;
  scan_status: string;
  storage_status: string;
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: ObjectStorageService,
  ) {}
  private async owner(
    auth: AuthContext,
    type: "STUDENT" | "SUBMISSION" | "EDUCATION_EXPENSE",
    id: string,
    write: boolean,
  ) {
    const result = await this.db.query<{
      student_id: string;
      school_id: string;
      grade_level_current: number | null;
      expense_status: string | null;
    }>(
      type === "STUDENT"
        ? `SELECT id student_id,current_school_id school_id,grade_level_current,NULL::text expense_status FROM students WHERE id=$1`
        : type === "SUBMISSION"
          ? `SELECT a.student_id,s.current_school_id school_id,s.grade_level_current,NULL::text expense_status FROM academic_submissions a JOIN students s ON s.id=a.student_id WHERE a.id=$1`
          : `SELECT e.student_id,e.school_id,s.grade_level_current,e.status expense_status FROM education_expenses e JOIN students s ON s.id=e.student_id WHERE e.id=$1`,
      [id],
    );
    const resource = result.rows[0];
    if (!resource) throw new DomainError("RESOURCE_NOT_FOUND", 404);
    const actor = toActor(auth);
    const allowed = write
      ? type === "SUBMISSION"
        ? can(actor, "submission.submit", {
            studentId: resource.student_id,
            schoolId: resource.school_id,
          })
        : type === "EDUCATION_EXPENSE"
          ? resource.expense_status !== "CONFIRMED" &&
            canManageExpense(actor, resource)
          : can(actor, "student.write", {
              studentId: resource.student_id,
              schoolId: resource.school_id,
            }) || can(actor, "student.self", { studentId: resource.student_id })
      : can(
          actor,
          type === "EDUCATION_EXPENSE" ? "expense.read" : "student.read",
          { studentId: resource.student_id, schoolId: resource.school_id },
        ) || can(actor, "student.self", { studentId: resource.student_id });
    if (!allowed) throw new DomainError("RESOURCE_NOT_FOUND", 404);
  }
  async initiate(auth: AuthContext, input: unknown) {
    const value = initSchema.parse(input);
    await this.owner(auth, value.owner_type, value.owner_id, true);
    const id = randomUUID();
    const key = `quarantine/${id}`;
    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO documents(id,object_key,checksum,size_bytes,mime_type,scan_status,original_filename,uploaded_by) VALUES($1,$2,$3,$4,$5,'PENDING',$6,$7)`,
        [
          id,
          key,
          value.checksum_sha256,
          value.size_bytes,
          value.mime_type,
          value.filename,
          auth.userId,
        ],
      );
      await client.query(
        `INSERT INTO document_links(document_id,owner_type,owner_id,purpose) VALUES($1,$2,$3,$4)`,
        [id, value.owner_type, value.owner_id, value.purpose],
      );
    });
    return {
      id,
      upload_url: await this.storage.uploadUrl(
        key,
        value.mime_type,
        value.checksum_sha256,
      ),
      expires_in_seconds: 900,
      required_headers: {
        "content-type": value.mime_type,
        "x-amz-meta-expected-sha256": value.checksum_sha256,
      },
    };
  }
  async complete(auth: AuthContext, id: string) {
    const document = await this.document(id);
    const link = await this.db.query<{
      owner_type: "STUDENT" | "SUBMISSION" | "EDUCATION_EXPENSE";
      owner_id: string;
    }>(
      `SELECT owner_type,owner_id FROM document_links WHERE document_id=$1 LIMIT 1`,
      [id],
    );
    if (!link.rows[0]) throw new DomainError("RESOURCE_NOT_FOUND", 404);
    await this.owner(
      auth,
      link.rows[0].owner_type,
      link.rows[0].owner_id,
      true,
    );
    if (
      document.scan_status !== "PENDING" ||
      document.storage_status !== "QUARANTINED"
    )
      throw new DomainError("INVALID_STATE_TRANSITION", 409);
    const head = await this.storage.head(document.object_key);
    if (
      Number(head.ContentLength) !== Number(document.size_bytes) ||
      head.Metadata?.["expected-sha256"] !== document.checksum
    )
      throw new DomainError("FILE_INTEGRITY_MISMATCH", 422);
    const detected = await fileTypeFromBuffer(
      await this.storage.prefix(document.object_key),
    );
    if (
      !detected ||
      !allowedMime.has(detected.mime) ||
      detected.mime !== document.mime_type
    )
      throw new DomainError("FILE_TYPE_MISMATCH", 422);
    await this.db.transaction(async (client) => {
      const updated = await client.query(
        `UPDATE documents SET completed_at=now(),version=version+1 WHERE id=$1 AND completed_at IS NULL RETURNING id`,
        [id],
      );
      if (!updated.rows[0])
        throw new DomainError("INVALID_STATE_TRANSITION", 409);
      await client.query(
        `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload) VALUES('DOCUMENT',$1,'document.scan.requested',$2)`,
        [id, JSON.stringify({ document_id: id })],
      );
    });
    return { id, scan_status: "PENDING" };
  }
  async download(auth: AuthContext, id: string) {
    const document = await this.document(id);
    const link = await this.db.query<{
      owner_type: "STUDENT" | "SUBMISSION" | "EDUCATION_EXPENSE";
      owner_id: string;
    }>(
      `SELECT owner_type,owner_id FROM document_links WHERE document_id=$1 LIMIT 1`,
      [id],
    );
    if (!link.rows[0]) throw new DomainError("RESOURCE_NOT_FOUND", 404);
    await this.owner(
      auth,
      link.rows[0].owner_type,
      link.rows[0].owner_id,
      false,
    );
    if (
      document.scan_status !== "CLEAN" ||
      document.storage_status !== "PROMOTED" ||
      !document.promoted_key
    )
      throw new DomainError("FILE_NOT_CLEAN", 422);
    return {
      download_url: await this.storage.downloadUrl(document.promoted_key),
      expires_in_seconds: 300,
    };
  }
  private async document(id: string) {
    const result = await this.db.query<DocumentRow>(
      `SELECT id,object_key,promoted_key,checksum,size_bytes,mime_type,scan_status,storage_status FROM documents WHERE id=$1`,
      [id],
    );
    if (!result.rows[0]) throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return result.rows[0];
  }
}

function canManageExpense(
  actor: ReturnType<typeof toActor>,
  resource: {
    student_id: string;
    school_id: string;
    grade_level_current: number | null;
    expense_status: string | null;
  },
) {
  const schoolManaged =
    resource.grade_level_current === null || resource.grade_level_current <= 9;
  return (
    can(actor, "expense.write", {
      studentId: resource.student_id,
      schoolId: resource.school_id,
    }) &&
    (actor.roles.some((role) =>
      ["SUPER_ADMIN", "PROGRAM_MANAGER"].includes(role),
    ) ||
      (schoolManaged &&
        actor.roles.includes("SCHOOL_MANAGER") &&
        actor.schoolIds.includes(resource.school_id)) ||
      (!schoolManaged &&
        actor.roles.includes("STUDENT") &&
        actor.studentId === resource.student_id))
  );
}
