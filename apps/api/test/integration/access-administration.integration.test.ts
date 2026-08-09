import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdministrationService } from "../../src/modules/administration/administration.service.js";
import { BreakGlassService } from "../../src/modules/breakglass/breakglass.service.js";
import { StudentsService } from "../../src/modules/students/students.service.js";
import { CryptoService } from "../../src/modules/identity/crypto.service.js";
import { IdentityService } from "../../src/modules/identity/identity.service.js";
import { DatabaseService } from "../../src/database/database.service.js";
import type { AuthContext } from "../../src/modules/identity/session.guard.js";

const suite = process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;

suite("privileged access administration", () => {
  const ids = {
    admin: randomUUID(),
    session: randomUUID(),
    school: randomUUID(),
    program: randomUUID(),
    student: randomUUID(),
  };
  const managedEmail = `${randomUUID()}@test.local`;
  const auth: AuthContext = {
    sessionId: ids.session,
    userId: ids.admin,
    roles: ["SUPER_ADMIN"],
    schoolIds: [],
    mfaVerified: true,
  };
  let db: DatabaseService;
  let admin: AdministrationService;
  let breakGlass: BreakGlassService;
  let students: StudentsService;
  let identity: IdentityService;
  let managedUserId = "";
  const tokenHash = randomUUID().replaceAll("-", "").repeat(2);
  const csrfHash = randomUUID().replaceAll("-", "").repeat(2);
  const identityNumber = randomInt(100_000_000_000, 999_999_999_999).toString();

  beforeAll(async () => {
    db = new DatabaseService();
    const crypto = new CryptoService();
    admin = new AdministrationService(db, crypto);
    breakGlass = new BreakGlassService(db);
    students = new StudentsService(db, crypto);
    identity = new IdentityService(db, crypto);
    await db.query(
      `INSERT INTO users(id,email,password_hash,status) VALUES($1,$2,'synthetic','ACTIVE')`,
      [ids.admin, `${ids.admin}@test.local`],
    );
    await db.query(
      `INSERT INTO sessions(id,user_id,token_hash,csrf_hash,mfa_verified_at,reauthenticated_at,expires_at)
       VALUES($1,$2,$3,$4,now(),now(),now()+interval '1 hour')`,
      [ids.session, ids.admin, tokenHash, csrfHash],
    );
    await db.query(
      `INSERT INTO schools(id,code,name) VALUES($1,$2,'Access Test School')`,
      [ids.school, `S${ids.school.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO programs(id,code,name,workflow_type) VALUES($1,$2,'Access Test Program','ONE_LEVEL')`,
      [ids.program, `P${ids.program.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO students(id,student_code,full_name,date_of_birth,program_id,current_school_id)
       VALUES($1,$2,'Identity Test Student','2010-01-01',$3,$4)`,
      [ids.student, `T${ids.student.slice(0, 8)}`, ids.program, ids.school],
    );
  });

  afterAll(async () => {
    await db.query(`DELETE FROM outbox_events WHERE aggregate_id IN($1,$2)`, [
      managedUserId || ids.admin,
      ids.student,
    ]);
    await db.query(`DELETE FROM break_glass_sessions WHERE user_id=$1`, [
      ids.admin,
    ]);
    await db.query(`DELETE FROM student_identity WHERE student_id=$1`, [
      ids.student,
    ]);
    await db.query(`DELETE FROM one_time_tokens WHERE user_id=$1`, [
      managedUserId || ids.admin,
    ]);
    await db.query(`DELETE FROM school_assignments WHERE user_id=$1`, [
      managedUserId || ids.admin,
    ]);
    await db.query(`DELETE FROM user_roles WHERE user_id=$1`, [
      managedUserId || ids.admin,
    ]);
    await db.query(`DELETE FROM sessions WHERE user_id IN($1,$2)`, [
      ids.admin,
      managedUserId || ids.admin,
    ]);
    await db.query(`DELETE FROM users WHERE id=$1`, [
      managedUserId || ids.admin,
    ]);
    await db.query(`DELETE FROM students WHERE id=$1`, [ids.student]);
    await db.query(`DELETE FROM programs WHERE id=$1`, [ids.program]);
    await db.query(`DELETE FROM schools WHERE id=$1`, [ids.school]);
    await db.query(`DELETE FROM users WHERE id=$1`, [ids.admin]);
    await db.onModuleDestroy();
  });

  it("creates and version-updates scoped users while revoking their sessions", async () => {
    const created = await admin.create(auth, {
      email: managedEmail,
      preferred_locale: "en-US",
      roles: ["SCHOOL_MANAGER"],
      school_ids: [ids.school],
    });
    managedUserId = created.id;
    expect(created.roles).toEqual(["SCHOOL_MANAGER"]);
    await db.query(
      `INSERT INTO sessions(user_id,token_hash,csrf_hash,mfa_verified_at,expires_at)
       VALUES($1,$2,$3,now(),now()+interval '1 hour')`,
      [
        managedUserId,
        randomUUID().replaceAll("-", "").repeat(2),
        randomUUID().replaceAll("-", "").repeat(2),
      ],
    );
    const updated = await admin.update(
      auth,
      managedUserId,
      String(created.version),
      {
        status: "SUSPENDED",
        roles: ["STUDENT"],
        school_ids: [],
        reason: "Access revoked by integration security test",
      },
    );
    expect(updated).toMatchObject({ status: "SUSPENDED", roles: ["STUDENT"] });
    const sessions = await db.query<{ revoke_reason: string | null }>(
      `SELECT revoke_reason FROM sessions WHERE user_id=$1`,
      [managedUserId],
    );
    expect(sessions.rows[0]?.revoke_reason).toBe("ACCESS_CHANGED");
  });

  it("requires scoped break-glass to reveal encrypted identity data", async () => {
    const saved = await students.updateIdentity(auth, ids.student, "0", {
      identity_number: identityNumber,
      reason: "Verified against original identity evidence",
    });
    expect(saved.identity_masked).toBe(`********${identityNumber.slice(-4)}`);
    const emergency = await breakGlass.start(auth, {
      reason: "Urgent identity verification for an approved support case",
      duration_minutes: 30,
      scope: { student_ids: [ids.student], school_ids: [] },
    });
    await expect(
      students.revealIdentity(auth, ids.student, {
        reason: "Verify the protected identifier for approved case handling",
      }),
    ).resolves.toEqual({ identity_number: identityNumber });
    await breakGlass.end(auth, emergency.id, {
      reason: "Approved emergency verification completed",
    });
    await expect(
      students.revealIdentity(auth, ids.student, {
        reason: "Attempt after emergency access has already been closed",
      }),
    ).rejects.toMatchObject({ code: "BREAK_GLASS_REQUIRED" });
  });

  it("persists the authenticated user's locale preference", async () => {
    await expect(identity.updatePreferences(auth, "en-US")).resolves.toEqual({
      preferred_locale: "en-US",
    });
    await expect(identity.preferences(auth)).resolves.toMatchObject({
      preferred_locale: "en-US",
      roles: ["SUPER_ADMIN"],
      student_id: null,
    });
  });
});
