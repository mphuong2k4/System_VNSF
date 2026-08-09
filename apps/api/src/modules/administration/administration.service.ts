import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import { can, toActor } from "../authorization/policy.js";
import { CryptoService } from "../identity/crypto.service.js";
import type { AuthContext } from "../identity/session.guard.js";

const roleSchema = z.enum([
  "SUPER_ADMIN",
  "PROGRAM_MANAGER",
  "SCHOOL_MANAGER",
  "STUDENT",
]);
const createSchema = z
  .object({
    email: z.string().email().max(254),
    preferred_locale: z.enum(["vi-VN", "en-US"]).default("vi-VN"),
    roles: z.array(roleSchema).min(1),
    school_ids: z.array(z.string().uuid()).default([]),
  })
  .strict();
const updateSchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
    preferred_locale: z.enum(["vi-VN", "en-US"]).optional(),
    roles: z.array(roleSchema).min(1).optional(),
    school_ids: z.array(z.string().uuid()).optional(),
    reason: z.string().min(10).max(500),
  })
  .strict();

type UserView = {
  id: string;
  email: string;
  status: string;
  preferred_locale: string;
  version: number;
  roles: string[];
  school_ids: string[];
};

@Injectable()
export class AdministrationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly crypto: CryptoService,
  ) {}

  private authorize(auth: AuthContext) {
    if (!can(toActor(auth), "user.admin", {}))
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
  }

  async list(auth: AuthContext, query: string) {
    this.authorize(auth);
    const search = z.string().max(100).parse(query).trim();
    return (
      await this.db.query<UserView>(
        `SELECT u.id,u.email,u.status,u.preferred_locale,u.version,
          COALESCE(array_agg(DISTINCT r.code) FILTER(WHERE r.code IS NOT NULL),'{}') roles,
          COALESCE(array_agg(DISTINCT sa.school_id::text) FILTER(WHERE sa.school_id IS NOT NULL),'{}') school_ids
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id=u.id AND ur.effective_from<=now() AND (ur.effective_to IS NULL OR ur.effective_to>now())
         LEFT JOIN roles r ON r.id=ur.role_id
         LEFT JOIN school_assignments sa ON sa.user_id=u.id AND sa.effective_from<=now() AND (sa.effective_to IS NULL OR sa.effective_to>now())
         WHERE $1='' OR u.email ILIKE '%'||$1||'%'
         GROUP BY u.id ORDER BY u.email LIMIT 100`,
        [search],
      )
    ).rows;
  }

  async create(auth: AuthContext, input: unknown) {
    this.authorize(auth);
    const value = createSchema.parse(input);
    const activation = randomBytes(32).toString("base64url");
    const unusablePassword = await argon2.hash(randomBytes(32));
    try {
      return await this.db.transaction(async (client) => {
        const user = (
          await client.query<UserView>(
            `INSERT INTO users(email,password_hash,status,preferred_locale)
             VALUES(lower($1),$2,'PENDING_ACTIVATION',$3)
             RETURNING id,email,status,preferred_locale,version,'{}'::text[] roles,'{}'::text[] school_ids`,
            [value.email, unusablePassword, value.preferred_locale],
          )
        ).rows[0]!;
        await this.replaceAssignments(
          client,
          user.id,
          value.roles,
          value.school_ids,
        );
        await client.query(
          `INSERT INTO one_time_tokens(user_id,purpose,token_hash,expires_at)
           VALUES($1,'ACTIVATION',$2,now()+interval '24 hours')`,
          [user.id, this.crypto.tokenHash(activation)],
        );
        await client.query(
          `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload)
           VALUES('USER',$1,'identity.activation_requested',$2)`,
          [
            user.id,
            JSON.stringify({
              user_id: user.id,
              encrypted_token: this.crypto
                .encrypt(activation)
                .toString("base64"),
            }),
          ],
        );
        await this.audit(client, auth.userId, "user.created", user.id, {
          email: user.email,
          roles: value.roles,
          school_ids: value.school_ids,
        });
        return { ...user, roles: value.roles, school_ids: value.school_ids };
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new DomainError("USER_EMAIL_EXISTS", 409);
      throw error;
    }
  }

  async update(
    auth: AuthContext,
    id: string,
    etag: string | undefined,
    input: unknown,
  ) {
    this.authorize(auth);
    if (!etag) throw new DomainError("PRECONDITION_REQUIRED", 428);
    const expected = Number(etag.replaceAll('"', ""));
    if (!Number.isInteger(expected))
      throw new DomainError("PRECONDITION_INVALID", 400);
    const value = updateSchema.parse(input);
    if (id === auth.userId && value.status === "SUSPENDED")
      throw new DomainError("USER_SELF_SUSPEND_FORBIDDEN", 409);
    return this.db.transaction(async (client) => {
      const before = (
        await client.query<{ status: string; preferred_locale: string }>(
          `SELECT status,preferred_locale FROM users WHERE id=$1 FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!before) throw new DomainError("RESOURCE_NOT_FOUND", 404);
      const updated = (
        await client.query<UserView>(
          `UPDATE users SET status=COALESCE($3,status),preferred_locale=COALESCE($4,preferred_locale),
             version=version+1,updated_at=now()
           WHERE id=$1 AND version=$2
           RETURNING id,email,status,preferred_locale,version,'{}'::text[] roles,'{}'::text[] school_ids`,
          [id, expected, value.status ?? null, value.preferred_locale ?? null],
        )
      ).rows[0];
      if (!updated) throw new DomainError("VERSION_CONFLICT", 409);
      if (value.roles || value.school_ids) {
        const current = await this.currentAssignments(client, id);
        await this.replaceAssignments(
          client,
          id,
          value.roles ?? current.roles,
          value.school_ids ?? current.school_ids,
        );
      }
      await client.query(
        `UPDATE sessions SET revoked_at=now(),revoke_reason='ACCESS_CHANGED'
         WHERE user_id=$1 AND revoked_at IS NULL`,
        [id],
      );
      await client.query(
        `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload)
         VALUES('USER',$1,'identity.access_changed',$2)`,
        [id, JSON.stringify({ user_id: id, reason: value.reason })],
      );
      const assignments = await this.currentAssignments(client, id);
      await this.audit(client, auth.userId, "user.access_changed", id, {
        status: updated.status,
        roles: assignments.roles,
        school_ids: assignments.school_ids,
        reason: value.reason,
      });
      return { ...updated, ...assignments };
    });
  }

  async roles(auth: AuthContext) {
    this.authorize(auth);
    return (
      await this.db.query<{ id: string; code: string }>(
        `SELECT id,code FROM roles ORDER BY code`,
      )
    ).rows;
  }

  async schools(auth: AuthContext) {
    this.authorize(auth);
    return (
      await this.db.query<{ id: string; code: string; name: string }>(
        `SELECT id,code,name FROM schools ORDER BY code`,
      )
    ).rows;
  }

  private async currentAssignments(client: PoolClient, userId: string) {
    const roles = await client.query(
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id
       WHERE ur.user_id=$1 AND ur.effective_from<=now() AND (ur.effective_to IS NULL OR ur.effective_to>now()) ORDER BY r.code`,
      [userId],
    );
    const schools = await client.query(
      `SELECT school_id::text id FROM school_assignments
       WHERE user_id=$1 AND effective_from<=now() AND (effective_to IS NULL OR effective_to>now()) ORDER BY school_id`,
      [userId],
    );
    return {
      roles: roles.rows.map((row: { code: string }) => row.code),
      school_ids: schools.rows.map((row: { id: string }) => row.id),
    };
  }

  private async replaceAssignments(
    client: PoolClient,
    userId: string,
    roles: string[],
    schoolIds: string[],
  ) {
    await client.query(
      `UPDATE user_roles SET effective_to=now() WHERE user_id=$1 AND effective_to IS NULL`,
      [userId],
    );
    await client.query(
      `UPDATE school_assignments SET effective_to=now() WHERE user_id=$1 AND effective_to IS NULL`,
      [userId],
    );
    for (const role of [...new Set(roles)]) {
      await client.query(
        `INSERT INTO user_roles(user_id,role_id,effective_from)
         SELECT $1,id,now() FROM roles WHERE code=$2`,
        [userId, role],
      );
    }
    for (const schoolId of [...new Set(schoolIds)]) {
      await client.query(
        `INSERT INTO school_assignments(user_id,school_id,effective_from) VALUES($1,$2,now())`,
        [userId, schoolId],
      );
    }
  }

  private async audit(
    client: PoolClient,
    actorId: string,
    action: string,
    resourceId: string,
    after: unknown,
  ) {
    await client.query(
      `INSERT INTO audit_events(actor_id,action,resource_type,resource_id,result,after_redacted,correlation_id)
       VALUES($1,$2,'user',$3,'SUCCESS',$4,gen_random_uuid())`,
      [actorId, action, resourceId, JSON.stringify(after)],
    );
  }
}

function isUniqueViolation(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
