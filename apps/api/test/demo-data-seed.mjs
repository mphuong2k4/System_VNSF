import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import pg from "pg";

if (
  process.env.APP_ENV !== "development" ||
  process.env.DEMO_ALLOW_DATA_SEED !== "true"
) {
  throw new Error(
    "Demo data seed requires APP_ENV=development and DEMO_ALLOW_DATA_SEED=true",
  );
}

const databaseUrl = process.env.DATABASE_URL;
const password = process.env.DEMO_SHARED_PASSWORD;
if (!databaseUrl || !password)
  throw new Error("DATABASE_URL and DEMO_SHARED_PASSWORD are required");
if (password.length < 16)
  throw new Error("DEMO_SHARED_PASSWORD must contain at least 16 characters");

const accounts = [
  ["admin.demo@vnsf.test", "SUPER_ADMIN"],
  ["program.demo@vnsf.test", "PROGRAM_MANAGER"],
  ["school.demo@vnsf.test", "SCHOOL_MANAGER"],
  ["student.demo@vnsf.test", "STUDENT"],
];
const schools = [
  ["VNSF-HN-01", "Trường THPT Chu Văn An"],
  ["VNSF-HUE-01", "Trường THPT Chuyên Quốc Học Huế"],
  ["VNSF-HCM-01", "Trường THPT Nguyễn Thượng Hiền"],
];
const studentNames = [
  "Nguyễn Minh Anh",
  "Trần Gia Hân",
  "Lê Hoàng Nam",
  "Phạm Khánh Linh",
  "Võ Đức Anh",
  "Đặng Ngọc Mai",
  "Bùi Quang Huy",
  "Đỗ Thảo Vy",
  "Hồ Minh Khang",
  "Nguyễn Phương Nhi",
  "Trần Tuấn Kiệt",
  "Lê Bảo Trâm",
  "Phạm Quốc Bảo",
  "Võ Thanh Hà",
  "Đặng Anh Thư",
  "Bùi Nhật Minh",
  "Đỗ Hải Yến",
  "Hồ Gia Bảo",
  "Nguyễn Mỹ Duyên",
  "Trần Đức Long",
  "Lê Ngọc Ánh",
  "Phạm Minh Quân",
  "Võ Khánh An",
  "Đặng Thu Trang",
];
const submissionStatuses = [
  "DRAFT",
  "SCHOOL_REVIEW",
  "PROGRAM_REVIEW",
  "APPROVED",
  "RETURNED",
  "LOCKED",
];
const transferStatuses = [
  "PENDING_TRANSFER",
  "AWAITING_CONFIRMATION",
  "RECEIVED",
  "NOT_RECEIVED",
  "UNDER_INVESTIGATION",
];

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("BEGIN");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const userIds = new Map();

  for (const [email, role] of accounts) {
    const user = await client.query(
      `INSERT INTO users(id,email,password_hash,status,preferred_locale,failed_count,locked_until)
       VALUES($1,$2,$3,'ACTIVE','vi-VN',0,NULL)
       ON CONFLICT ((lower(email))) DO UPDATE SET
         password_hash=excluded.password_hash,status='ACTIVE',preferred_locale='vi-VN',
         failed_count=0,locked_until=NULL,updated_at=now()
       RETURNING id`,
      [randomUUID(), email, passwordHash],
    );
    const userId = user.rows[0].id;
    userIds.set(role, userId);
    await client.query(`DELETE FROM user_roles WHERE user_id=$1`, [userId]);
    await client.query(
      `INSERT INTO user_roles(user_id,role_id)
       SELECT $1,id FROM roles WHERE code=$2`,
      [userId, role],
    );
    await client.query(
      `UPDATE sessions SET revoked_at=now(),revoke_reason='DEMO_DATA_RESEEDED'
       WHERE user_id=$1 AND revoked_at IS NULL`,
      [userId],
    );
  }

  const schoolIds = [];
  for (const [code, name] of schools) {
    const school = await client.query(
      `INSERT INTO schools(id,code,name) VALUES($1,$2,$3)
       ON CONFLICT(code) DO UPDATE SET name=excluded.name,updated_at=now()
       RETURNING id`,
      [randomUUID(), code, name],
    );
    schoolIds.push(school.rows[0].id);
  }

  const schoolManagerId = userIds.get("SCHOOL_MANAGER");
  await client.query(`DELETE FROM school_assignments WHERE user_id=$1`, [
    schoolManagerId,
  ]);
  await client.query(
    `INSERT INTO school_assignments(user_id,school_id,effective_from)
     VALUES($1,$2,now()-interval '1 day')`,
    [schoolManagerId, schoolIds[0]],
  );

  const program = await client.query(
    `INSERT INTO programs(id,code,name,workflow_type,self_service_mode,self_service_min_grade)
     VALUES($1,'VNSF-DEMO-2026','Học bổng Phát triển Tài năng VNSF','TWO_LEVEL','HYBRID',10)
     ON CONFLICT(code) DO UPDATE SET name=excluded.name,workflow_type=excluded.workflow_type,
       self_service_mode=excluded.self_service_mode,updated_at=now()
     RETURNING id`,
    [randomUUID()],
  );
  const programId = program.rows[0].id;
  const period = await client.query(
    `INSERT INTO academic_periods(id,program_id,code,due_at,workflow_type)
     VALUES($1,$2,'2026-HK1',now()+interval '45 days','TWO_LEVEL')
     ON CONFLICT(program_id,code) DO UPDATE SET due_at=excluded.due_at
     RETURNING id`,
    [randomUUID(), programId],
  );
  const periodId = period.rows[0].id;
  const programManagerId = userIds.get("PROGRAM_MANAGER");
  let linkedStudentId;

  for (let index = 0; index < studentNames.length; index += 1) {
    const status =
      index < 20
        ? "ACTIVE"
        : index < 22
          ? "SCHOLARSHIP_STOPPED"
          : "UNREACHABLE";
    const schoolId = schoolIds[index % schoolIds.length];
    const code = `VNSF-DEMO-${String(index + 1).padStart(3, "0")}`;
    const student = await client.query(
      `INSERT INTO students(id,student_code,full_name,date_of_birth,program_id,current_school_id,
         grade_level_current,status,status_notes)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(student_code) DO UPDATE SET full_name=excluded.full_name,
         date_of_birth=excluded.date_of_birth,program_id=excluded.program_id,
         current_school_id=excluded.current_school_id,grade_level_current=excluded.grade_level_current,
         status=excluded.status,status_notes=excluded.status_notes,updated_at=now()
       RETURNING id`,
      [
        randomUUID(),
        code,
        studentNames[index],
        `${2008 + (index % 3)}-${String((index % 12) + 1).padStart(2, "0")}-15`,
        programId,
        schoolId,
        10 + (index % 3),
        status,
        status === "ACTIVE" ? null : "Dữ liệu giả lập phục vụ kiểm thử quản lý",
      ],
    );
    const studentId = student.rows[0].id;
    if (index === 0) linkedStudentId = studentId;
    await client.query(
      `INSERT INTO student_school_history(student_id,school_id,effective_from,change_reason,changed_by)
       SELECT $1,$2,'2025-09-01','INITIAL_ENROLLMENT',$3
       WHERE NOT EXISTS(SELECT 1 FROM student_school_history WHERE student_id=$1)`,
      [studentId, schoolId, programManagerId],
    );
    await client.query(
      `INSERT INTO academic_submissions(student_id,period_id,type,status,current_version_no,created_by,effective_due_at)
       VALUES($1,$2,'SEMESTER_RESULT',$3,0,$4,now()+interval '45 days')
       ON CONFLICT(student_id,period_id,type) DO UPDATE SET status=excluded.status`,
      [
        studentId,
        periodId,
        submissionStatuses[index % submissionStatuses.length],
        programManagerId,
      ],
    );
    await client.query(
      `INSERT INTO manual_transfers(student_id,period_id,school_id,created_by,transfer_type,
         amount,currency,transferred_at,reference,status)
       VALUES($1,$2,$3,$4,'SCHOLARSHIP',$5,'VND',
         CASE WHEN $6='PENDING_TRANSFER' THEN NULL ELSE now()-($7::int * interval '1 day') END,$8,$6)
       ON CONFLICT DO NOTHING`,
      [
        studentId,
        periodId,
        schoolId,
        programManagerId,
        5000000 + (index % 4) * 1000000,
        transferStatuses[index % transferStatuses.length],
        index + 1,
        `VNSF-DEMO-TX-${String(index + 1).padStart(3, "0")}`,
      ],
    );
  }

  const studentUserId = userIds.get("STUDENT");
  await client.query(`DELETE FROM user_student_links WHERE user_id=$1`, [
    studentUserId,
  ]);
  await client.query(
    `INSERT INTO user_student_links(user_id,student_id) VALUES($1,$2)`,
    [studentUserId, linkedStudentId],
  );

  for (const [role, userId] of userIds) {
    await client.query(
      `INSERT INTO notifications(user_id,type,payload,dedupe_key)
       VALUES($1,'demo.data_ready',$2,$3)
       ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE SET
         payload=excluded.payload,read_at=NULL,created_at=now()`,
      [
        userId,
        JSON.stringify({
          message: `Dữ liệu demo cho vai trò ${role} đã sẵn sàng`,
        }),
        `demo-data-ready-${role.toLowerCase()}`,
      ],
    );
  }

  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      accounts: accounts.map(([email, role]) => ({ email, role })),
      students: studentNames.length,
      schools: schools.length,
    }),
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
