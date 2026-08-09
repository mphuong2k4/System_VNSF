import {
  createCipheriv,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
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
const encryptionKey = Buffer.from(
  process.env.FIELD_ENCRYPTION_KEY_BASE64 ?? "",
  "base64",
);
const hmacKey = Buffer.from(process.env.FIELD_HMAC_KEY_BASE64 ?? "", "base64");
if (encryptionKey.length !== 32 || hmacKey.length < 32)
  throw new Error("Valid field encryption keys are required");
function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}
function hmac(value) {
  return createHmac("sha256", hmacKey).update(value).digest("hex");
}

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
    `INSERT INTO schools(id,code,name) VALUES($1,'E2E-SCHOOL','Trường THPT Chuyên Nguyễn Huệ') ON CONFLICT(code) DO UPDATE SET name=excluded.name`,
    [schoolId],
  );
  await client.query(
    `INSERT INTO programs(id,code,name,workflow_type,self_service_mode) VALUES($1,'E2E-PROGRAM','Học bổng Phát triển Tài năng VNSF','ONE_LEVEL','STUDENT_MANAGED') ON CONFLICT(code) DO UPDATE SET name=excluded.name,self_service_mode=excluded.self_service_mode`,
    [programId],
  );
  const school = await client.query(
    `SELECT id FROM schools WHERE code='E2E-SCHOOL'`,
  );
  const program = await client.query(
    `SELECT id FROM programs WHERE code='E2E-PROGRAM'`,
  );
  const linkedStudent = await client.query(
    `SELECT student_id FROM user_student_links WHERE user_id=$1 AND effective_to IS NULL LIMIT 1`,
    [user.rows[0].id],
  );
  const effectiveStudentId = linkedStudent.rows[0]?.student_id ?? studentId;
  const student = await client.query(
    `INSERT INTO students(id,student_code,full_name,date_of_birth,program_id,current_school_id,grade_level_current)
     VALUES($1,'VNSF-2026-001','Nguyễn Minh Anh','2010-05-18',$2,$3,10)
     ON CONFLICT(id) DO UPDATE SET student_code=excluded.student_code,full_name=excluded.full_name,date_of_birth=excluded.date_of_birth,program_id=excluded.program_id,current_school_id=excluded.current_school_id,grade_level_current=excluded.grade_level_current
     RETURNING id`,
    [effectiveStudentId, program.rows[0].id, school.rows[0].id],
  );
  await client.query(
    `INSERT INTO user_student_links(user_id,student_id)
     SELECT $1,$2 WHERE NOT EXISTS (SELECT 1 FROM user_student_links WHERE user_id=$1 AND effective_to IS NULL)`,
    [user.rows[0].id, student.rows[0].id],
  );
  await client.query(
    `INSERT INTO student_school_history(student_id,school_id,effective_from,change_reason,changed_by)
     SELECT $1,$2,'2025-09-01','INITIAL_ENROLLMENT',$3 WHERE NOT EXISTS(SELECT 1 FROM student_school_history WHERE student_id=$1)`,
    [student.rows[0].id, school.rows[0].id, user.rows[0].id],
  );
  const contact = JSON.stringify({
    phone: "0901234567",
    email: "phuhuynh.minhanh@example.test",
  });
  const guardian = await client.query(
    `INSERT INTO guardians(full_name,contact_ciphertext,contact_hmac)
     SELECT 'Nguyễn Thị Lan',$1,$2 WHERE NOT EXISTS(SELECT 1 FROM student_guardians WHERE student_id=$3)
     RETURNING id`,
    [encrypt(contact), hmac(contact), student.rows[0].id],
  );
  if (guardian.rows[0])
    await client.query(
      `INSERT INTO student_guardians(student_id,guardian_id,relationship,is_primary) VALUES($1,$2,'MOTHER',true)`,
      [student.rows[0].id, guardian.rows[0].id],
    );
  const identityNumber = "001210012345";
  await client.query(
    `INSERT INTO student_identity(student_id,ciphertext,key_version,identity_hmac,updated_by)
     VALUES($1,$2,1,$3,$4) ON CONFLICT(student_id) DO NOTHING`,
    [
      student.rows[0].id,
      encrypt(identityNumber),
      hmac(identityNumber),
      user.rows[0].id,
    ],
  );
  const accountNumber = "012345678901";
  await client.query(
    `INSERT INTO student_bank_accounts(student_id,account_name_ciphertext,account_number_ciphertext,account_hmac,key_version,bank_code,status)
     SELECT $1,$2,$3,$4,1,'VCB','PENDING_REVIEW'
     WHERE NOT EXISTS(SELECT 1 FROM student_bank_accounts WHERE student_id=$1 AND effective_to IS NULL)`,
    [
      student.rows[0].id,
      encrypt("NGUYEN MINH ANH"),
      encrypt(accountNumber),
      hmac(accountNumber),
    ],
  );
  const period = await client.query(
    `INSERT INTO academic_periods(program_id,code,opens_at,due_at,workflow_type)
     VALUES($1,'2026-SEMESTER-1',now()-interval '30 days',now()+interval '60 days','ONE_LEVEL')
     ON CONFLICT(program_id,code) DO UPDATE SET due_at=excluded.due_at RETURNING id`,
    [program.rows[0].id],
  );
  await client.query(
    `INSERT INTO academic_submissions(student_id,period_id,type,status,draft_payload_json,created_by,current_version_no,effective_due_at)
     SELECT $1,$2,'SEMESTER_RESULT','DRAFT',$3,$4,0,due_at FROM academic_periods WHERE id=$2
     ON CONFLICT(student_id,period_id,type) DO NOTHING`,
    [
      student.rows[0].id,
      period.rows[0].id,
      JSON.stringify({
        average_score: 8.7,
        conduct: "Tốt",
        semester: "Học kỳ I",
      }),
      user.rows[0].id,
    ],
  );
  await client.query(
    `INSERT INTO education_expenses(student_id,school_id,academic_year,vnd_per_term,vnd_per_year,notes,status,updated_by)
     VALUES($1,$2,'2025-2026',4500000,9000000,'Học phí và tài liệu học tập','CONFIRMED',$3)
     ON CONFLICT(student_id,academic_year) DO NOTHING`,
    [student.rows[0].id, school.rows[0].id, user.rows[0].id],
  );
  await client.query(
    `INSERT INTO student_support_programs(student_id,school_id,program_code,received,received_date,support_value,currency,status,notes,created_by,updated_by)
     SELECT $1,$2,'DESK',true,'2026-01-15',2500000,'VND','ACTIVE','Bộ bàn học và dụng cụ học tập',$3,$3
     WHERE NOT EXISTS(SELECT 1 FROM student_support_programs WHERE student_id=$1 AND program_code='DESK')`,
    [student.rows[0].id, school.rows[0].id, user.rows[0].id],
  );
  await client.query(
    `INSERT INTO manual_transfers(student_id,period_id,school_id,created_by,transfer_type,amount,currency,transferred_at,reference,status)
     SELECT $1,$2,$3,$4,'SCHOLARSHIP',6000000,'VND',now()-interval '10 days','VNSF-DEMO-2026-001','RECEIVED'
     WHERE NOT EXISTS(SELECT 1 FROM manual_transfers WHERE student_id=$1 AND reference='VNSF-DEMO-2026-001')`,
    [student.rows[0].id, period.rows[0].id, school.rows[0].id, user.rows[0].id],
  );
  await client.query(
    `INSERT INTO notifications(user_id,type,payload,resource_type,resource_id)
     SELECT $1,'student.profile_ready',$2,'STUDENT',$3 WHERE NOT EXISTS(SELECT 1 FROM notifications WHERE user_id=$1 AND type='student.profile_ready')`,
    [
      user.rows[0].id,
      JSON.stringify({
        message: "Hồ sơ học sinh demo đã được cập nhật đầy đủ",
      }),
      student.rows[0].id,
    ],
  );
  await client.query("COMMIT");
  console.log(`Seeded synthetic E2E account ${email}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
