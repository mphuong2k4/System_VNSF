import type { Pool, PoolClient } from "pg";

export const milestones = [-14, -7, -2, 1, 7] as const;
type Override = { calendar_date: string; day_type: "HOLIDAY" | "WORKING_DAY" };

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function moveDate(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function reminderTime(
  dueAt: Date,
  milestone: (typeof milestones)[number],
  overrides: Override[],
) {
  let key = moveDate(dateKey(dueAt), milestone);
  if (milestone < 0) {
    const byDate = new Map(
      overrides.map((item) => [item.calendar_date, item.day_type]),
    );
    for (let checked = 0; checked < 370; checked += 1) {
      const cursor = new Date(`${key}T00:00:00Z`);
      const override = byDate.get(key);
      const weekend = cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6;
      if (override === "WORKING_DAY" || (override !== "HOLIDAY" && !weekend))
        break;
      key = moveDate(key, 1);
    }
  }
  return new Date(`${key}T02:00:00.000Z`); // 09:00 Asia/Ho_Chi_Minh
}

export async function reconcileReminders(database: Pool) {
  await database.query(
    `UPDATE reminder_schedules r SET status='CANCELLED',updated_at=now()
     FROM academic_submissions a
     WHERE a.id=r.obligation_id AND r.status='SCHEDULED' AND a.status NOT IN ('DRAFT','RETURNED')`,
  );
  const obligations = await database.query<{
    id: string;
    user_id: string;
    school_id: string;
    effective_due_at: Date;
  }>(
    `SELECT a.id,l.user_id,s.current_school_id school_id,a.effective_due_at
     FROM academic_submissions a JOIN students s ON s.id=a.student_id
     JOIN user_student_links l ON l.student_id=s.id
       AND l.effective_from<=now() AND (l.effective_to IS NULL OR l.effective_to>now())
     WHERE a.status IN ('DRAFT','RETURNED')`,
  );
  const calendar = await database.query<Override>(
    `SELECT calendar_date::text,day_type FROM calendar_days`,
  );
  for (const obligation of obligations.rows) {
    await database.query(
      `UPDATE reminder_schedules SET status='CANCELLED',updated_at=now()
       WHERE obligation_id=$1 AND status='SCHEDULED' AND due_at_snapshot<>$2`,
      [obligation.id, obligation.effective_due_at],
    );
    for (const milestone of milestones) {
      await database.query(
        `INSERT INTO reminder_schedules(obligation_type,obligation_id,user_id,school_id,milestone_days,due_at_snapshot,scheduled_for)
         VALUES('ACADEMIC_SUBMISSION',$1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [
          obligation.id,
          obligation.user_id,
          obligation.school_id,
          milestone,
          obligation.effective_due_at,
          reminderTime(obligation.effective_due_at, milestone, calendar.rows),
        ],
      );
    }
  }
}

export async function enqueueDueReminders(database: Pool) {
  await database.connect().then(async (client) => {
    try {
      await client.query("BEGIN");
      const due = await client.query<{
        id: string;
        obligation_id: string;
        user_id: string;
        milestone_days: number;
        due_at_snapshot: Date;
      }>(
        `SELECT id,obligation_id,user_id,milestone_days,due_at_snapshot FROM reminder_schedules
         WHERE status='SCHEDULED' AND scheduled_for<=now()
         ORDER BY scheduled_for LIMIT 100 FOR UPDATE SKIP LOCKED`,
      );
      for (const item of due.rows) {
        await insertReminderEvent(client, item);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}

async function insertReminderEvent(
  client: PoolClient,
  item: {
    id: string;
    obligation_id: string;
    user_id: string;
    milestone_days: number;
    due_at_snapshot: Date;
  },
) {
  await client.query(
    `INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload)
     VALUES('REMINDER',$1,'academic.reminder.due',$2)`,
    [
      item.id,
      JSON.stringify({
        schedule_id: item.id,
        submission_id: item.obligation_id,
        user_id: item.user_id,
        milestone: item.milestone_days,
        due_at: item.due_at_snapshot,
      }),
    ],
  );
  await client.query(
    `UPDATE reminder_schedules SET status='ENQUEUED',updated_at=now() WHERE id=$1`,
    [item.id],
  );
}
