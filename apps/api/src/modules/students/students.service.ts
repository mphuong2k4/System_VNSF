import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import { can, toActor } from "../authorization/policy.js";
import type { AuthContext } from "../identity/session.guard.js";
import { CryptoService } from "../identity/crypto.service.js";
const schema = z
  .object({
    student_code: z.string().min(3).max(30),
    full_name: z.string().min(1).max(150),
    date_of_birth: z.string().date(),
    program_id: z.string().uuid(),
    current_school_id: z.string().uuid(),
    grade_level_current: z.number().int().min(1).max(12).optional(),
  })
  .strict();
const createSchema = schema
  .extend({ duplicate_override_reason: z.string().min(10).max(500).optional() })
  .strict();
const guardianSchema = z
  .object({
    full_name: z.string().min(2).max(150),
    relationship: z.enum(["MOTHER", "FATHER", "GUARDIAN", "OTHER"]),
    is_primary: z.boolean().default(false),
    phone: z.string().min(8).max(20).optional(),
    email: z.string().email().optional(),
  })
  .strict()
  .refine((value) => value.phone || value.email, "GUARDIAN_CONTACT_REQUIRED");
const transferSchema = z
  .object({
    target_school_id: z.string().uuid(),
    effective_from: z.string().date(),
    reason: z.string().min(10).max(500),
  })
  .strict()
  .refine(
    (value) => value.effective_from <= new Date().toISOString().slice(0, 10),
    "SCHOOL_TRANSFER_FUTURE_DATE",
  );
const identitySchema = z
  .object({
    identity_number: z.string().regex(/^\d{9,12}$/),
    reason: z.string().min(10).max(500),
  })
  .strict();
const revealIdentitySchema = z
  .object({ reason: z.string().min(20).max(1000) })
  .strict();
type StudentRow = z.infer<typeof schema> & {
  id: string;
  version: number;
  status: string;
  program_name?: string;
  school_name?: string;
};
@Injectable()
export class StudentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly crypto: CryptoService,
  ) {}
  async list(auth: AuthContext, page: number, size: number) {
    const safe = Math.min(Math.max(size, 1), 100),
      current = Math.max(page, 1),
      offset = (current - 1) * safe;
    const actor = toActor(auth);
    const mayRead = can(actor, "student.read", {});
    const mayReadSelf =
      !!actor.studentId &&
      can(actor, "student.self", { studentId: actor.studentId });
    if (!mayRead && !mayReadSelf)
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    const unrestricted = actor.roles.some(
      (role) => role === "SUPER_ADMIN" || role === "PROGRAM_MANAGER",
    );
    const result = await this.db.query<StudentRow & { total_count: string }>(
      `SELECT s.id,s.student_code,s.full_name,s.date_of_birth,s.program_id,s.current_school_id,
        s.grade_level_current,s.status,s.version,p.name program_name,sc.name school_name,count(*) OVER() total_count
       FROM students s JOIN programs p ON p.id=s.program_id JOIN schools sc ON sc.id=s.current_school_id
       WHERE $1::boolean OR s.current_school_id=ANY($2::uuid[]) OR s.id=$3::uuid
       ORDER BY s.student_code LIMIT $4 OFFSET $5`,
      [unrestricted, actor.schoolIds, actor.studentId ?? null, safe, offset],
    );
    return {
      items: result.rows.map(({ total_count, ...item }) => item),
      page: current,
      size: safe,
      total: Number(result.rows[0]?.total_count ?? 0),
    };
  }
  async create(auth: AuthContext, input: unknown) {
    const value = createSchema.parse(input);
    if (
      !can(toActor(auth), "student.write", {
        schoolId: value.current_school_id,
      })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    try {
      return await this.db.transaction(async (client) => {
        const duplicates = await client.query<{ id: string }>(
          `SELECT id FROM students WHERE date_of_birth=$1 AND lower(regexp_replace(trim(full_name),'\\s+',' ','g'))=lower(regexp_replace(trim($2),'\\s+',' ','g')) LIMIT 1`,
          [value.date_of_birth, value.full_name],
        );
        if (duplicates.rowCount && !value.duplicate_override_reason)
          throw new DomainError("STUDENT_DUPLICATE_SUSPECTED", 409);
        const result = await client.query<StudentRow>(
          `INSERT INTO students(student_code,full_name,date_of_birth,program_id,current_school_id,grade_level_current) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,student_code,full_name,date_of_birth,program_id,current_school_id,grade_level_current,status,version`,
          [
            value.student_code,
            value.full_name,
            value.date_of_birth,
            value.program_id,
            value.current_school_id,
            value.grade_level_current ?? null,
          ],
        );
        const student = result.rows[0]!;
        await client.query(
          `INSERT INTO student_school_history(student_id,school_id,effective_from,change_reason,changed_by) VALUES($1,$2,CURRENT_DATE,$3,$4)`,
          [
            student.id,
            student.current_school_id,
            value.duplicate_override_reason
              ? `DUPLICATE_OVERRIDE: ${value.duplicate_override_reason}`
              : "INITIAL_ENROLLMENT",
            auth.userId,
          ],
        );
        await client.query(
          `INSERT INTO student_profile_versions(student_id,version_no,snapshot_json,change_reason,changed_by) VALUES($1,1,$2,$3,$4)`,
          [
            student.id,
            JSON.stringify(student),
            value.duplicate_override_reason
              ? `DUPLICATE_OVERRIDE: ${value.duplicate_override_reason}`
              : "PROFILE_CREATED",
            auth.userId,
          ],
        );
        return student;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new DomainError("STUDENT_CODE_DUPLICATE", 409);
      throw error;
    }
  }
  async duplicates(auth: AuthContext, fullName: string, dateOfBirth: string) {
    const actor = toActor(auth);
    const firstSchool = actor.schoolIds[0];
    if (
      !can(actor, "student.write", firstSchool ? { schoolId: firstSchool } : {})
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    const unrestricted = actor.roles.some(
      (role) => role === "SUPER_ADMIN" || role === "PROGRAM_MANAGER",
    );
    return (
      await this.db.query<
        Pick<
          StudentRow,
          | "id"
          | "student_code"
          | "full_name"
          | "date_of_birth"
          | "current_school_id"
        >
      >(
        `SELECT id,student_code,full_name,date_of_birth,current_school_id FROM students
       WHERE date_of_birth=$1 AND lower(regexp_replace(trim(full_name),'\\s+',' ','g'))=lower(regexp_replace(trim($2),'\\s+',' ','g'))
       AND ($3::boolean OR current_school_id=ANY($4::uuid[])) ORDER BY student_code LIMIT 20`,
        [
          z.string().date().parse(dateOfBirth),
          z.string().min(2).max(150).parse(fullName),
          unrestricted,
          actor.schoolIds,
        ],
      )
    ).rows;
  }
  async get(auth: AuthContext, id: string) {
    const result = await this.db.query<StudentRow>(
      `SELECT s.id,s.student_code,s.full_name,s.date_of_birth,s.program_id,s.current_school_id,
        s.grade_level_current,s.status,s.version,p.name program_name,sc.name school_name
       FROM students s JOIN programs p ON p.id=s.program_id JOIN schools sc ON sc.id=s.current_school_id WHERE s.id=$1`,
      [id],
    );
    const item = result.rows[0];
    if (!item) throw new DomainError("RESOURCE_NOT_FOUND", 404);
    const actor = toActor(auth);
    if (
      !can(actor, "student.read", {
        schoolId: item.current_school_id,
        studentId: id,
      }) &&
      !can(actor, "student.self", { studentId: id })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return item;
  }
  async update(
    auth: AuthContext,
    id: string,
    etag: string | undefined,
    input: unknown,
  ) {
    if (!etag) throw new DomainError("PRECONDITION_REQUIRED", 428);
    const expected = Number(etag.replaceAll('"', ""));
    if (!Number.isInteger(expected))
      throw new DomainError("PRECONDITION_INVALID", 400);
    const value = schema
      .partial()
      .omit({ student_code: true, program_id: true, current_school_id: true })
      .parse(input);
    const current = await this.get(auth, id);
    const actor = toActor(auth);
    if (
      !can(actor, "student.write", {
        schoolId: current.current_school_id,
        studentId: id,
      })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    const result = await this.db.transaction(async (client) => {
      const updated = await client.query<StudentRow>(
        `UPDATE students SET full_name=COALESCE($3,full_name),date_of_birth=COALESCE($4,date_of_birth),current_school_id=COALESCE($5,current_school_id),grade_level_current=COALESCE($6,grade_level_current),version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING id,student_code,full_name,date_of_birth,program_id,current_school_id,grade_level_current,status,version`,
        [
          id,
          expected,
          value.full_name ?? null,
          value.date_of_birth ?? null,
          null,
          value.grade_level_current ?? null,
        ],
      );
      if (updated.rows[0])
        await client.query(
          `INSERT INTO student_profile_versions(student_id,version_no,snapshot_json,change_reason,changed_by) VALUES($1,$2,$3,'PROFILE_UPDATED',$4)`,
          [
            id,
            updated.rows[0].version,
            JSON.stringify(updated.rows[0]),
            auth.userId,
          ],
        );
      return updated;
    });
    if (!result.rows[0]) {
      const exists = await this.db.query(`SELECT 1 FROM students WHERE id=$1`, [
        id,
      ]);
      throw new DomainError(
        exists.rowCount ? "VERSION_CONFLICT" : "RESOURCE_NOT_FOUND",
        exists.rowCount ? 412 : 404,
      );
    }
    return result.rows[0];
  }
  async guardians(auth: AuthContext, id: string) {
    await this.get(auth, id);
    return (
      await this.db.query<{
        id: string;
        full_name: string;
        relationship: string;
        is_primary: boolean;
        contact_ciphertext: Buffer;
      }>(
        `SELECT g.id,g.full_name,sg.relationship,sg.is_primary,g.contact_ciphertext FROM guardians g JOIN student_guardians sg ON sg.guardian_id=g.id WHERE sg.student_id=$1 ORDER BY sg.is_primary DESC,g.full_name`,
        [id],
      )
    ).rows.map(({ contact_ciphertext, ...row }) => ({
      ...row,
      ...maskContact(
        JSON.parse(this.crypto.decrypt(contact_ciphertext)) as Contact,
      ),
    }));
  }
  async addGuardian(auth: AuthContext, id: string, input: unknown) {
    const student = await this.get(auth, id);
    if (
      !can(toActor(auth), "guardian.write", {
        schoolId: student.current_school_id,
        studentId: id,
      })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    const value = guardianSchema.parse(input);
    const contact: Contact = {
      ...(value.phone ? { phone: value.phone } : {}),
      ...(value.email ? { email: value.email.toLowerCase() } : {}),
    };
    return this.db.transaction(async (client) => {
      if (value.is_primary)
        await client.query(
          `UPDATE student_guardians SET is_primary=false WHERE student_id=$1 AND is_primary`,
          [id],
        );
      const guardian = await client.query<{ id: string }>(
        `INSERT INTO guardians(full_name,contact_ciphertext,contact_hmac) VALUES($1,$2,$3) RETURNING id`,
        [
          value.full_name,
          this.crypto.encrypt(JSON.stringify(contact)),
          this.crypto.hash(JSON.stringify(contact)),
        ],
      );
      await client.query(
        `INSERT INTO student_guardians(student_id,guardian_id,relationship,is_primary) VALUES($1,$2,$3,$4)`,
        [id, guardian.rows[0]!.id, value.relationship, value.is_primary],
      );
      return {
        id: guardian.rows[0]!.id,
        full_name: value.full_name,
        relationship: value.relationship,
        is_primary: value.is_primary,
        ...maskContact(contact),
      };
    });
  }
  async history(auth: AuthContext, id: string) {
    await this.get(auth, id);
    return (
      await this.db.query(
        `SELECT h.id,h.school_id,s.code school_code,s.name school_name,h.effective_from,h.effective_to,h.change_reason FROM student_school_history h JOIN schools s ON s.id=h.school_id WHERE h.student_id=$1 ORDER BY h.effective_from DESC`,
        [id],
      )
    ).rows;
  }
  async transfer(
    auth: AuthContext,
    id: string,
    etag: string | undefined,
    input: unknown,
  ) {
    if (!etag) throw new DomainError("PRECONDITION_REQUIRED", 428);
    const expected = Number(etag.replaceAll('"', ""));
    if (!Number.isInteger(expected))
      throw new DomainError("PRECONDITION_INVALID", 400);
    const value = transferSchema.parse(input);
    const current = await this.get(auth, id);
    const actor = toActor(auth);
    if (
      !can(actor, "student.write", {
        schoolId: current.current_school_id,
        studentId: id,
      }) ||
      !can(actor, "student.write", {
        schoolId: value.target_school_id,
        studentId: id,
      })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    if (current.current_school_id === value.target_school_id)
      throw new DomainError("SCHOOL_TRANSFER_SAME_SCHOOL", 409);
    const target = await this.db.query(
      `SELECT 1 FROM schools WHERE id=$1 AND active`,
      [value.target_school_id],
    );
    if (!target.rowCount) throw new DomainError("RESOURCE_NOT_FOUND", 404);
    try {
      return await this.db.transaction(async (client) => {
        const updated = await client.query<StudentRow>(
          `UPDATE students SET current_school_id=$3,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING id,student_code,full_name,date_of_birth,program_id,current_school_id,grade_level_current,status,version`,
          [id, expected, value.target_school_id],
        );
        if (!updated.rows[0]) throw new DomainError("VERSION_CONFLICT", 412);
        await client.query(
          `UPDATE student_school_history SET effective_to=$2::date WHERE student_id=$1 AND effective_to IS NULL`,
          [id, value.effective_from],
        );
        await client.query(
          `INSERT INTO student_school_history(student_id,school_id,effective_from,change_reason,changed_by) VALUES($1,$2,$3,$4,$5)`,
          [
            id,
            value.target_school_id,
            value.effective_from,
            value.reason,
            auth.userId,
          ],
        );
        await client.query(
          `INSERT INTO student_profile_versions(student_id,version_no,snapshot_json,change_reason,changed_by) VALUES($1,$2,$3,$4,$5)`,
          [
            id,
            updated.rows[0].version,
            JSON.stringify(updated.rows[0]),
            `SCHOOL_TRANSFER: ${value.reason}`,
            auth.userId,
          ],
        );
        return updated.rows[0];
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        ["23P01", "23514"].includes(String((error as { code: unknown }).code))
      )
        throw new DomainError("SCHOOL_TRANSFER_DATE_CONFLICT", 409);
      throw error;
    }
  }

  async identity(auth: AuthContext, id: string) {
    const student = await this.get(auth, id);
    const actor = toActor(auth);
    if (
      !can(actor, "student.read", {
        studentId: id,
        schoolId: student.current_school_id,
      }) &&
      !can(actor, "student.self", { studentId: id })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    const row = (
      await this.db.query<{ ciphertext: Buffer; version: number }>(
        `SELECT ciphertext,version FROM student_identity WHERE student_id=$1`,
        [id],
      )
    ).rows[0];
    if (!row) return { configured: false, version: 0 };
    const plain = this.crypto.decrypt(row.ciphertext);
    return {
      configured: true,
      identity_masked: `${"*".repeat(Math.max(0, plain.length - 4))}${plain.slice(-4)}`,
      version: row.version,
    };
  }

  async updateIdentity(
    auth: AuthContext,
    id: string,
    etag: string | undefined,
    input: unknown,
  ) {
    const student = await this.get(auth, id);
    if (
      !can(toActor(auth), "student.write", {
        studentId: id,
        schoolId: student.current_school_id,
      })
    )
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    if (!etag) throw new DomainError("PRECONDITION_REQUIRED", 428);
    const expected = Number(etag.replaceAll('"', ""));
    if (!Number.isInteger(expected) || expected < 0)
      throw new DomainError("PRECONDITION_INVALID", 400);
    const value = identitySchema.parse(input);
    try {
      return await this.db.transaction(async (client) => {
        const result = await client.query<{ version: number }>(
          `INSERT INTO student_identity(student_id,ciphertext,key_version,identity_hmac,updated_by,version)
           SELECT $1,$2,1,$3,$4,1 WHERE $5=0
           ON CONFLICT(student_id) DO UPDATE SET ciphertext=excluded.ciphertext,
             identity_hmac=excluded.identity_hmac,updated_by=excluded.updated_by,
             updated_at=now(),version=student_identity.version+1
           WHERE student_identity.version=$5
           RETURNING version`,
          [
            id,
            this.crypto.encrypt(value.identity_number),
            this.crypto.hash(value.identity_number),
            auth.userId,
            expected,
          ],
        );
        if (!result.rows[0]) throw new DomainError("VERSION_CONFLICT", 409);
        await client.query(
          `INSERT INTO audit_events(actor_id,action,resource_type,resource_id,result,after_redacted,correlation_id)
           VALUES($1,'student.identity.updated','student',$2,'SUCCESS',$3,gen_random_uuid())`,
          [auth.userId, id, JSON.stringify({ reason: value.reason })],
        );
        return {
          configured: true,
          identity_masked: `${"*".repeat(value.identity_number.length - 4)}${value.identity_number.slice(-4)}`,
          version: result.rows[0].version,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new DomainError("STUDENT_IDENTITY_DUPLICATE", 409);
      throw error;
    }
  }

  async revealIdentity(auth: AuthContext, id: string, input: unknown) {
    const value = revealIdentitySchema.parse(input);
    const student = await this.get(auth, id);
    if (!auth.roles.includes("SUPER_ADMIN"))
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return this.db.transaction(async (client) => {
      const access = (
        await client.query<{ ciphertext: Buffer }>(
          `SELECT si.ciphertext FROM student_identity si
           JOIN sessions s ON s.id=$2 AND s.user_id=$3 AND s.reauthenticated_at>now()-interval '5 minutes'
           JOIN break_glass_sessions bg ON bg.session_id=s.id AND bg.revoked_at IS NULL AND bg.expires_at>now()
           WHERE si.student_id=$1
             AND (bg.scope_json->'student_ids' ? $1::text OR bg.scope_json->'school_ids' ? $4::text)`,
          [id, auth.sessionId, auth.userId, student.current_school_id],
        )
      ).rows[0];
      if (!access) throw new DomainError("BREAK_GLASS_REQUIRED", 403);
      await client.query(
        `INSERT INTO audit_events(actor_id,action,resource_type,resource_id,result,after_redacted,correlation_id)
         VALUES($1,'student.identity.revealed','student',$2,'SUCCESS',$3,gen_random_uuid())`,
        [auth.userId, id, JSON.stringify({ reason: value.reason })],
      );
      return { identity_number: this.crypto.decrypt(access.ciphertext) };
    });
  }
}
export type Contact = { phone?: string; email?: string };
export function maskContact(contact: Contact) {
  const phone = contact.phone
    ? `${"*".repeat(Math.max(0, contact.phone.length - 4))}${contact.phone.slice(-4)}`
    : undefined;
  const email = contact.email
    ? contact.email.replace(/^(.).+(@.+)$/, "$1***$2")
    : undefined;
  return {
    ...(phone ? { phone_masked: phone } : {}),
    ...(email ? { email_masked: email } : {}),
  };
}
function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}
