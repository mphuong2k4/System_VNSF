import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { Pool } from "pg";
import { loadConfig } from "@vnsf/config";
import { scanDocument } from "./document-scanner.js";
import { deliverEvent } from "./notifications.js";
import { enqueueDueReminders, reconcileReminders } from "./reminders.js";

type OutboxRow = {
  id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
};
const config = loadConfig();
const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const database = new Pool({
  connectionString: config.DATABASE_URL,
  max: 5,
  statement_timeout: 10_000,
});
const queue = new Queue("vnsf", { connection });
const consumer = new Worker(
  "vnsf",
  async (job) => {
    if (job.name === "document.scan.requested") {
      const payload = job.data as { document_id?: unknown };
      if (typeof payload.document_id !== "string")
        throw new Error("DOCUMENT_ID_REQUIRED");
      await scanDocument(database, payload.document_id);
      return;
    }
    await deliverEvent(
      database,
      job.name,
      job.data as Record<string, unknown>,
      String(job.id),
    );
  },
  { connection, concurrency: 2 },
);
let stopping = false;

async function dispatchBatch(): Promise<void> {
  const result = await database.query<OutboxRow>(
    `SELECT id,event_type,payload,attempts FROM outbox_events
     WHERE processed_at IS NULL AND available_at<=now()
     ORDER BY available_at LIMIT 50`,
  );
  for (const event of result.rows) {
    try {
      await queue.add(event.event_type, event.payload, {
        jobId: event.id,
        attempts: 5,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: { age: 86_400 },
      });
      await database.query(
        `UPDATE outbox_events SET processed_at=now() WHERE id=$1 AND processed_at IS NULL`,
        [event.id],
      );
    } catch {
      await database.query(
        `UPDATE outbox_events SET attempts=attempts+1,available_at=now()+LEAST(interval '1 minute',interval '1 second'*power(2,attempts+1)) WHERE id=$1`,
        [event.id],
      );
    }
  }
}

async function run(): Promise<void> {
  let nextReconciliation = 0;
  while (!stopping) {
    if (Date.now() >= nextReconciliation) {
      await reconcileReminders(database);
      await enqueueDueReminders(database);
      nextReconciliation = Date.now() + 60_000;
    }
    await dispatchBatch();
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function shutdown(): Promise<void> {
  stopping = true;
  await queue.close();
  await consumer.close();
  await connection.quit();
  await database.end();
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
void run();
