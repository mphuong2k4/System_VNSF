import { createDecipheriv } from "node:crypto";
import type { Pool } from "pg";
import { loadConfig } from "@vnsf/config";
import { sendSmtpText } from "./smtp-client.js";

type Payload = Record<string, unknown>;
type Recipient = { user_id: string; email: string; locale: "vi-VN" | "en-US" };

function render(template: string, payload: Payload) {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) =>
    String(payload[key] ?? ""),
  );
}

function decryptToken(value: string) {
  const config = loadConfig();
  const buffer = Buffer.from(value, "base64");
  const key = Buffer.from(config.FIELD_ENCRYPTION_KEY_BASE64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([
    decipher.update(buffer.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}

export async function deliverEvent(
  database: Pool,
  eventType: string,
  payload: Payload,
  eventId: string,
) {
  const descriptor = await describeEvent(database, eventType, payload);
  if (!descriptor) return;
  for (const recipient of descriptor.recipients) {
    await deliver(
      database,
      recipient,
      descriptor.type,
      {
        ...descriptor.payload,
        resource_code: descriptor.resourceId.slice(0, 8).toUpperCase(),
      },
      descriptor.resourceType,
      descriptor.resourceId,
      `${eventId}:${recipient.user_id}`,
    );
  }
}

async function deliver(
  database: Pool,
  recipient: Recipient,
  type: string,
  payload: Payload,
  resourceType: string,
  resourceId: string,
  dedupeKey: string,
) {
  const config = loadConfig();
  const template = await database.query<{
    subject_template: string;
    body_template: string;
  }>(
    `SELECT subject_template,body_template FROM notification_templates
     WHERE type=$1 AND locale=$2 AND active=true ORDER BY version DESC LIMIT 1`,
    [type, recipient.locale],
  );
  const selected = template.rows[0];
  if (!selected)
    throw new Error(
      `NOTIFICATION_TEMPLATE_MISSING:${type}:${recipient.locale}`,
    );
  const inserted = await database.query<{ id: string }>(
    `INSERT INTO notifications(user_id,type,payload,resource_type,resource_id,dedupe_key)
     VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING id`,
    [
      recipient.user_id,
      type,
      JSON.stringify(payload),
      resourceType,
      resourceId,
      dedupeKey,
    ],
  );
  let notificationId = inserted.rows[0]?.id;
  if (!notificationId) {
    notificationId = (
      await database.query<{ id: string }>(
        `SELECT id FROM notifications WHERE dedupe_key=$1`,
        [dedupeKey],
      )
    ).rows[0]?.id;
  }
  if (!notificationId) throw new Error("NOTIFICATION_CREATE_FAILED");
  await database.query(
    `INSERT INTO notification_deliveries(notification_id,channel,locale_used,status,sent_at)
     VALUES($1,'IN_APP',$2,'SENT',now()) ON CONFLICT (notification_id,channel) DO NOTHING`,
    [notificationId, recipient.locale],
  );
  const delivery = await database.query<{
    id: string;
    status: string;
    attempts: number;
  }>(
    `INSERT INTO notification_deliveries(notification_id,channel,locale_used,status,next_attempt_at)
     VALUES($1,'EMAIL',$2,'PENDING',now()) ON CONFLICT (notification_id,channel) DO UPDATE
     SET updated_at=now() RETURNING id,status,attempts`,
    [notificationId, recipient.locale],
  );
  const row = delivery.rows[0];
  if (!row || row.status === "SENT") return;
  try {
    await database.query(
      `UPDATE notification_deliveries SET status='PROCESSING',updated_at=now() WHERE id=$1`,
      [row.id],
    );
    await sendSmtpText({
      smtpUrl: config.SMTP_URL,
      from: config.EMAIL_FROM,
      to: recipient.email,
      subject: render(selected.subject_template, payload),
      text: render(selected.body_template, payload),
    });
    await database.query(
      `UPDATE notification_deliveries SET status='SENT',sent_at=now(),attempts=attempts+1,
       last_error_code=NULL,next_attempt_at=NULL,updated_at=now() WHERE id=$1`,
      [row.id],
    );
    if (type === "academic.reminder")
      await database.query(
        `UPDATE reminder_schedules SET status='SENT',notification_id=$2,updated_at=now() WHERE id=$1`,
        [payload.schedule_id, notificationId],
      );
  } catch (error) {
    await database.query(
      `UPDATE notification_deliveries SET status='FAILED',attempts=attempts+1,last_error_code='SMTP_DELIVERY_FAILED',
       next_attempt_at=now()+LEAST(interval '1 hour',interval '1 minute'*power(2,attempts+1)),updated_at=now() WHERE id=$1`,
      [row.id],
    );
    throw error;
  }
}

async function describeEvent(
  database: Pool,
  eventType: string,
  payload: Payload,
) {
  if (eventType === "academic.reminder.due") {
    const recipient = await usersByIds(database, [String(payload.user_id)]);
    return {
      type: "academic.reminder",
      resourceType: "SUBMISSION",
      resourceId: String(payload.submission_id),
      recipients: recipient,
      payload: {
        ...payload,
        due_at: new Date(String(payload.due_at)).toISOString(),
      },
    };
  }
  if (eventType === "identity.password_reset_requested") {
    const config = loadConfig();
    const recipients = await usersByIds(database, [String(payload.user_id)]);
    const token = decryptToken(String(payload.encrypted_token));
    return {
      type: "identity.password_reset",
      resourceType: "USER",
      resourceId: String(payload.user_id),
      recipients,
      payload: {
        reset_url: `${config.APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`,
      },
    };
  }
  const resolved = await resolveStudent(database, payload);
  if (!resolved) return undefined;
  const recipients = await database.query<Recipient>(
    `SELECT u.id user_id,u.email,u.preferred_locale locale FROM user_student_links l JOIN users u ON u.id=l.user_id
     WHERE l.student_id=$1 AND l.effective_from<=now() AND (l.effective_to IS NULL OR l.effective_to>now()) AND u.status='ACTIVE'`,
    [resolved.studentId],
  );
  const parts = eventType.split(".");
  const prefix = parts[0] ?? "";
  const type =
    prefix === "submission"
      ? "submission.status_changed"
      : prefix === "extension"
        ? "extension.status_changed"
        : prefix === "thank_you"
          ? "thank_you.status_changed"
          : prefix === "transfer"
            ? "transfer.status_changed"
            : prefix === "expense"
              ? "expense.status_changed"
              : undefined;
  if (!type) return undefined;
  return {
    type,
    resourceType: prefix.toUpperCase(),
    resourceId: resolved.resourceId,
    recipients: recipients.rows,
    payload: {
      ...payload,
      status: (parts[1] ?? "updated").toUpperCase(),
    },
  };
}

async function usersByIds(database: Pool, ids: string[]) {
  return (
    await database.query<Recipient>(
      `SELECT id user_id,email,preferred_locale locale FROM users WHERE id=ANY($1::uuid[]) AND status='ACTIVE'`,
      [ids],
    )
  ).rows;
}

async function resolveStudent(database: Pool, payload: Payload) {
  if (typeof payload.student_id === "string")
    return {
      studentId: payload.student_id,
      resourceId: String(payload.transfer_id ?? payload.student_id),
    };
  const candidates: [string, unknown, string][] = [
    ["academic_submissions", payload.submission_id, "student_id"],
    [
      "extension_requests e JOIN academic_submissions a ON a.id=e.obligation_id",
      payload.extension_id,
      "a.student_id",
    ],
    ["thank_you_letters", payload.letter_id, "student_id"],
  ];
  for (const [source, id, column] of candidates) {
    if (typeof id !== "string") continue;
    const row = await database.query<{ student_id: string }>(
      `SELECT ${column} student_id FROM ${source} WHERE ${source.includes(" ") ? "e" : source.slice(0, 1)}.id=$1`,
      [id],
    );
    if (row.rows[0])
      return { studentId: row.rows[0].student_id, resourceId: id };
  }
  return undefined;
}
