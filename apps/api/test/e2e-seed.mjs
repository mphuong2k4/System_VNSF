import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import pg from "pg";

if (process.env.APP_ENV !== "test" || process.env.E2E_ALLOW_SEED !== "true") {
  throw new Error(
    "E2E seed is restricted to APP_ENV=test with E2E_ALLOW_SEED=true",
  );
}

const email = process.env.E2E_USER_EMAIL ?? "student.e2e@vnsf.test";
const password = process.env.E2E_USER_PASSWORD ?? "Vnsf-E2E-Password-2026!";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("BEGIN");
  const userId = randomUUID();
  const schoolId = randomUUID();
  const programId = randomUUID();
  const studentId = randomUUID();
  const passwordHash = await argon2.hash(password);
  const user = await client.query(
    `INSERT INTO users(id,email,password_hash,status) VALUES($1,$2,$3,'ACTIVE')
     ON CONFLICT ((lower(email))) DO UPDATE SET password_hash=excluded.password_hash,status='ACTIVE',failed_count=0,locked_until=NULL
     RETURNING id`,
    [userId, email, passwordHash],
  );
  await client.query(
    `INSERT INTO roles(code) VALUES('STUDENT') ON CONFLICT(code) DO NOTHING`,
  );
  await client.query(
    `INSERT INTO user_roles(user_id,role_id)
     SELECT $1,id FROM roles WHERE code='STUDENT'
     ON CONFLICT DO NOTHING`,
    [user.rows[0].id],
  );
  await client.query(
    `INSERT INTO schools(id,code,name) VALUES($1,'E2E-SCHOOL','E2E School') ON CONFLICT(code) DO NOTHING`,
    [schoolId],
  );
  await client.query(
    `INSERT INTO programs(id,code,name,workflow_type,self_service_mode) VALUES($1,'E2E-PROGRAM','E2E Program','ONE_LEVEL','STUDENT_MANAGED') ON CONFLICT(code) DO NOTHING`,
    [programId],
  );
  const school = await client.query(
    `SELECT id FROM schools WHERE code='E2E-SCHOOL'`,
  );
  const program = await client.query(
    `SELECT id FROM programs WHERE code='E2E-PROGRAM'`,
  );
  const student = await client.query(
    `INSERT INTO students(id,student_code,full_name,date_of_birth,program_id,current_school_id,grade_level_current)
     VALUES($1,'E2E-STUDENT','E2E Student','2010-01-01',$2,$3,10)
     ON CONFLICT(student_code) DO UPDATE SET program_id=excluded.program_id,current_school_id=excluded.current_school_id
     RETURNING id`,
    [studentId, program.rows[0].id, school.rows[0].id],
  );
  await client.query(
    `INSERT INTO user_student_links(user_id,student_id)
     SELECT $1,$2 WHERE NOT EXISTS (SELECT 1 FROM user_student_links WHERE user_id=$1 AND effective_to IS NULL)`,
    [user.rows[0].id, student.rows[0].id],
  );
  await client.query("COMMIT");
  console.log(`Seeded synthetic E2E account ${email}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
