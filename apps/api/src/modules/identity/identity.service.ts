import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { authenticator } from "otplib";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import { CryptoService } from "./crypto.service.js";
type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  status: string;
  failed_count: number;
  locked_until: Date | null;
  requires_mfa: boolean;
};
type SessionRow = {
  id: string;
  user_id: string;
  mfa_verified_at: Date | null;
  expires_at: Date;
  csrf_hash: string;
};
type AuthRow = SessionRow & {
  roles: string[];
  school_ids: string[];
  student_id: string | null;
};
@Injectable()
export class IdentityService {
  constructor(
    private readonly db: DatabaseService,
    private readonly crypto: CryptoService,
  ) {}
  async login(email: string, password: string) {
    const result = await this.db.query<UserRow>(
      `SELECT u.*, EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND (ur.effective_to IS NULL OR ur.effective_to>now()) AND r.code IN('SUPER_ADMIN','PROGRAM_MANAGER','SCHOOL_MANAGER')) requires_mfa FROM users u WHERE lower(email)=lower($1)`,
      [email],
    );
    const user = result.rows[0];
    if (
      !user ||
      user.status !== "ACTIVE" ||
      (user.locked_until && user.locked_until > new Date()) ||
      !(await argon2.verify(user.password_hash, password))
    ) {
      if (user)
        await this.db.query(
          `UPDATE users SET failed_count=failed_count+1,locked_until=CASE WHEN failed_count+1>=5 THEN now()+interval '15 minutes' ELSE locked_until END WHERE id=$1`,
          [user.id],
        );
      throw new DomainError("INVALID_CREDENTIALS", 401);
    }
    await this.db.query(
      `UPDATE users SET failed_count=0,locked_until=NULL WHERE id=$1`,
      [user.id],
    );
    return this.createSession(user.id, !user.requires_mfa);
  }
  async createSession(userId: string, mfaVerified: boolean) {
    const token = randomBytes(32).toString("base64url");
    const csrf = randomBytes(32).toString("base64url");
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO sessions(user_id,token_hash,csrf_hash,mfa_verified_at,expires_at) VALUES($1,$2,$3,CASE WHEN $4 THEN now() END,now()+interval '8 hours') RETURNING id`,
      [
        userId,
        this.crypto.tokenHash(token),
        this.crypto.tokenHash(csrf),
        mfaVerified,
      ],
    );
    return {
      sessionId: result.rows[0]!.id,
      token,
      csrf,
      mfaRequired: !mfaVerified,
    };
  }
  async session(token: string) {
    const result = await this.db.query<SessionRow>(
      `SELECT * FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()`,
      [this.crypto.tokenHash(token)],
    );
    const session = result.rows[0];
    if (!session) throw new DomainError("AUTH_REQUIRED", 401);
    return session;
  }
  async authenticate(
    token: string,
    method: string,
    csrf: string,
    cookieCsrf: string,
  ) {
    if (!token) throw new DomainError("AUTH_REQUIRED", 401);
    const result = await this.db.query<AuthRow>(
      `SELECT s.*, COALESCE(array_agg(DISTINCT r.code) FILTER(WHERE r.code IS NOT NULL),'{}') roles,
       COALESCE(array_agg(DISTINCT sa.school_id::text) FILTER(WHERE sa.school_id IS NOT NULL),'{}') school_ids,
       max(usl.student_id::text) student_id
       FROM sessions s
       LEFT JOIN user_roles ur ON ur.user_id=s.user_id AND ur.effective_from<=now() AND (ur.effective_to IS NULL OR ur.effective_to>now())
       LEFT JOIN roles r ON r.id=ur.role_id
       LEFT JOIN school_assignments sa ON sa.user_id=s.user_id AND sa.effective_from<=now() AND (sa.effective_to IS NULL OR sa.effective_to>now())
       LEFT JOIN user_student_links usl ON usl.user_id=s.user_id AND usl.effective_from<=now() AND (usl.effective_to IS NULL OR usl.effective_to>now())
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()
       GROUP BY s.id`,
      [this.crypto.tokenHash(token)],
    );
    const session = result.rows[0];
    if (!session) throw new DomainError("AUTH_REQUIRED", 401);
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      if (
        !csrf ||
        !cookieCsrf ||
        csrf !== cookieCsrf ||
        this.crypto.tokenHash(csrf) !== session.csrf_hash
      )
        throw new DomainError("CSRF_INVALID", 403);
    }
    await this.db.query(
      `UPDATE sessions SET last_seen_at=now() WHERE id=$1 AND last_seen_at<now()-interval '1 minute'`,
      [session.id],
    );
    return {
      sessionId: session.id,
      userId: session.user_id,
      roles: session.roles,
      schoolIds: session.school_ids,
      ...(session.student_id ? { studentId: session.student_id } : {}),
      mfaVerified: session.mfa_verified_at !== null,
    };
  }
  async verifyMfa(token: string, code: string) {
    const session = await this.session(token);
    const result = await this.db.query<{ secret_ciphertext: Buffer }>(
      `SELECT secret_ciphertext FROM mfa_factors WHERE user_id=$1 AND verified_at IS NOT NULL AND disabled_at IS NULL`,
      [session.user_id],
    );
    const factor = result.rows[0];
    if (
      !factor ||
      !authenticator.check(code, this.crypto.decrypt(factor.secret_ciphertext))
    )
      throw new DomainError("MFA_CODE_INVALID", 401);
    await this.db.query(
      `UPDATE sessions SET mfa_verified_at=now() WHERE id=$1`,
      [session.id],
    );
    return { verified: true };
  }
  async beginMfaEnrollment(token: string, email: string) {
    const session = await this.session(token);
    const secret = authenticator.generateSecret();
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO mfa_factors(user_id,type,secret_ciphertext,key_version) VALUES($1,'TOTP',$2,1)
       ON CONFLICT(user_id,type) WHERE disabled_at IS NULL DO UPDATE SET secret_ciphertext=excluded.secret_ciphertext,key_version=excluded.key_version,verified_at=NULL
       RETURNING id`,
      [session.user_id, this.crypto.encrypt(secret)],
    );
    return {
      factor_id: result.rows[0]!.id,
      otpauth_uri: authenticator.keyuri(email, "VNSF", secret),
    };
  }
  async confirmMfaEnrollment(token: string, code: string) {
    const session = await this.session(token);
    const result = await this.db.query<{
      id: string;
      secret_ciphertext: Buffer;
    }>(
      `SELECT id,secret_ciphertext FROM mfa_factors WHERE user_id=$1 AND verified_at IS NULL AND disabled_at IS NULL FOR UPDATE`,
      [session.user_id],
    );
    const factor = result.rows[0];
    if (
      !factor ||
      !authenticator.check(code, this.crypto.decrypt(factor.secret_ciphertext))
    )
      throw new DomainError("MFA_CODE_INVALID", 401);
    const recoveryCodes = Array.from({ length: 8 }, () =>
      randomBytes(9).toString("base64url"),
    );
    await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE mfa_factors SET verified_at=now() WHERE id=$1`,
        [factor.id],
      );
      for (const recovery of recoveryCodes) {
        await client.query(
          `INSERT INTO mfa_recovery_codes(factor_id,code_hash) VALUES($1,$2)`,
          [factor.id, await argon2.hash(recovery)],
        );
      }
      await client.query(
        `UPDATE sessions SET mfa_verified_at=now() WHERE id=$1`,
        [session.id],
      );
    });
    return { recovery_codes: recoveryCodes };
  }
  async verifyRecoveryCode(token: string, code: string) {
    const session = await this.session(token);
    const result = await this.db.query<{ id: string; code_hash: string }>(
      `SELECT rc.id,rc.code_hash FROM mfa_recovery_codes rc JOIN mfa_factors f ON f.id=rc.factor_id WHERE f.user_id=$1 AND f.disabled_at IS NULL AND rc.used_at IS NULL`,
      [session.user_id],
    );
    const matched = await this.findRecovery(result.rows, code);
    if (!matched) throw new DomainError("MFA_RECOVERY_INVALID", 401);
    await this.db.transaction(async (client) => {
      const used = await client.query(
        `UPDATE mfa_recovery_codes SET used_at=now() WHERE id=$1 AND used_at IS NULL RETURNING id`,
        [matched],
      );
      if (!used.rowCount) throw new DomainError("MFA_RECOVERY_INVALID", 401);
      await client.query(
        `UPDATE sessions SET mfa_verified_at=now() WHERE id=$1`,
        [session.id],
      );
    });
    return { verified: true };
  }
  private async findRecovery(
    rows: { id: string; code_hash: string }[],
    code: string,
  ) {
    for (const row of rows)
      if (await argon2.verify(row.code_hash, code)) return row.id;
    return undefined;
  }
  async requestPasswordReset(email: string) {
    const user = await this.db.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email)=lower($1) AND status='ACTIVE'`,
      [email],
    );
    if (!user.rows[0]) return { accepted: true };
    const raw = randomBytes(32).toString("base64url");
    await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE one_time_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose='PASSWORD_RESET' AND consumed_at IS NULL`,
        [user.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO one_time_tokens(user_id,purpose,token_hash,expires_at) VALUES($1,'PASSWORD_RESET',$2,now()+interval '30 minutes')`,
        [user.rows[0]!.id, this.crypto.tokenHash(raw)],
      );
      await client.query(
        `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload) VALUES('USER',$1,'identity.password_reset_requested',$2)`,
        [
          user.rows[0]!.id,
          JSON.stringify({
            user_id: user.rows[0]!.id,
            encrypted_token: this.crypto.encrypt(raw).toString("base64"),
          }),
        ],
      );
    });
    return { accepted: true };
  }
  async consumeOneTimeToken(
    purpose: "ACTIVATION" | "PASSWORD_RESET",
    token: string,
    password: string,
  ) {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    return this.db.transaction(async (client) => {
      const found = await client.query<{ id: string; user_id: string }>(
        `SELECT id,user_id FROM one_time_tokens WHERE purpose=$1 AND token_hash=$2 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`,
        [purpose, this.crypto.tokenHash(token)],
      );
      const record = found.rows[0];
      if (!record) throw new DomainError("TOKEN_INVALID_OR_EXPIRED", 422);
      await client.query(
        `UPDATE one_time_tokens SET consumed_at=now() WHERE id=$1`,
        [record.id],
      );
      await client.query(
        `UPDATE users SET password_hash=$2,status='ACTIVE',failed_count=0,locked_until=NULL,version=version+1,updated_at=now() WHERE id=$1`,
        [record.user_id, passwordHash],
      );
      await client.query(
        `UPDATE sessions SET revoked_at=now(),revoke_reason=$2 WHERE user_id=$1 AND revoked_at IS NULL`,
        [record.user_id, purpose],
      );
      return { completed: true };
    });
  }
  async reauthenticate(token: string, password: string) {
    const session = await this.session(token);
    const user = await this.db.query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id=$1 AND status='ACTIVE'`,
      [session.user_id],
    );
    if (
      !user.rows[0] ||
      !(await argon2.verify(user.rows[0].password_hash, password))
    )
      throw new DomainError("INVALID_CREDENTIALS", 401);
    await this.db.query(
      `UPDATE sessions SET reauthenticated_at=now() WHERE id=$1`,
      [session.id],
    );
    return { reauthenticated: true, valid_for_seconds: 300 };
  }
  async listSessions(token: string) {
    const current = await this.session(token);
    const result = await this.db.query(
      `SELECT id,created_at,last_seen_at,expires_at,mfa_verified_at,id=$2 current FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC`,
      [current.user_id, current.id],
    );
    return result.rows;
  }
  async revoke(token: string, id: string) {
    const current = await this.session(token);
    const result = await this.db.query(
      `UPDATE sessions SET revoked_at=now(),revoke_reason='USER_REVOKED' WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id`,
      [id, current.user_id],
    );
    if (!result.rowCount) throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return { id };
  }
  async logout(token: string) {
    await this.db.query(
      `UPDATE sessions SET revoked_at=now(),revoke_reason='LOGOUT' WHERE token_hash=$1 AND revoked_at IS NULL`,
      [this.crypto.tokenHash(token)],
    );
  }
}
