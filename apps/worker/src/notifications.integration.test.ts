import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { loadConfig } from "@vnsf/config";
import { deliverEvent } from "./notifications.js";
import { enqueueDueReminders, reconcileReminders } from "./reminders.js";

const suite = process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;
suite("notification reminder delivery", () => {
  const ids = {
    school: randomUUID(),
    program: randomUUID(),
    period: randomUUID(),
    user: randomUUID(),
    student: randomUUID(),
    submission: randomUUID(),
  };
  let database: Pool;
  beforeAll(async () => {
    database = new Pool({ connectionString: loadConfig().DATABASE_URL });
    await database.query(
      `INSERT INTO users(id,email,password_hash,status,preferred_locale) VALUES($1,$2,'x','ACTIVE','en-US')`,
      [ids.user, `${ids.user}@test.local`],
    );
    await database.query(
      `INSERT INTO schools(id,code,name) VALUES($1,$2,'Reminder School')`,
      [ids.school, `S${ids.school.slice(0, 8)}`],
    );
    await database.query(
      `INSERT INTO programs(id,code,name,workflow_type) VALUES($1,$2,'Reminder Program','ONE_LEVEL')`,
      [ids.program, `P${ids.program.slice(0, 8)}`],
    );
    await database.query(
      `INSERT INTO academic_periods(id,program_id,code,due_at,workflow_type) VALUES($1,$2,$3,now()+interval '1 day','ONE_LEVEL')`,
      [ids.period, ids.program, `T${ids.period.slice(0, 8)}`],
    );
    await database.query(
      `INSERT INTO students(id,student_code,full_name,date_of_birth,program_id,current_school_id,grade_level_current)
      VALUES($1,$2,'Reminder Student','2009-01-01',$3,$4,10)`,
      [ids.student, `H${ids.student.slice(0, 8)}`, ids.program, ids.school],
    );
    await database.query(
      `INSERT INTO user_student_links(user_id,student_id) VALUES($1,$2)`,
      [ids.user, ids.student],
    );
    await database.query(
      `INSERT INTO academic_submissions(id,student_id,period_id,type,status,created_by,effective_due_at)
      VALUES($1,$2,$3,'TRANSCRIPT','DRAFT',$4,now()+interval '1 day')`,
      [ids.submission, ids.student, ids.period, ids.user],
    );
  });
  afterAll(async () => database.end());
  it("reconciles five milestones and idempotently delivers due email/in-app", async () => {
    await reconcileReminders(database);
    const schedules = await database.query<{ id: string }>(
      `SELECT id FROM reminder_schedules WHERE obligation_id=$1 ORDER BY milestone_days`,
      [ids.submission],
    );
    expect(schedules.rowCount).toBe(5);
    await database.query(
      `UPDATE reminder_schedules SET scheduled_for=now()-interval '1 minute'
      WHERE id=$1`,
      [schedules.rows[0]!.id],
    );
    await enqueueDueReminders(database);
    const event = await database.query<{
      id: string;
      event_type: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT id,event_type,payload FROM outbox_events WHERE aggregate_id=$1`,
      [schedules.rows[0]!.id],
    );
    expect(event.rows[0]?.event_type).toBe("academic.reminder.due");
    await deliverEvent(
      database,
      event.rows[0]!.event_type,
      event.rows[0]!.payload,
      event.rows[0]!.id,
    );
    await deliverEvent(
      database,
      event.rows[0]!.event_type,
      event.rows[0]!.payload,
      event.rows[0]!.id,
    );
    const notifications = await database.query<{
      locale_used: string;
      status: string;
    }>(
      `SELECT d.locale_used,d.status FROM notifications n JOIN notification_deliveries d ON d.notification_id=n.id
       WHERE n.dedupe_key=$1 AND d.channel='EMAIL'`,
      [`${event.rows[0]!.id}:${ids.user}`],
    );
    expect(notifications.rows).toEqual([
      { locale_used: "en-US", status: "SENT" },
    ]);
    await database.query(
      `UPDATE academic_submissions SET status='SCHOOL_REVIEW' WHERE id=$1`,
      [ids.submission],
    );
    await reconcileReminders(database);
    const remaining = await database.query<{ count: string }>(
      `SELECT count(*)::text count FROM reminder_schedules WHERE obligation_id=$1 AND status='SCHEDULED'`,
      [ids.submission],
    );
    expect(remaining.rows[0]?.count).toBe("0");
  });
});
