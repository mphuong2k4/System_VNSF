import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { DatabaseService } from "../database/database.service.js";
import { Public } from "../modules/identity/auth.decorators.js";
import { MetricsService } from "./metrics.service.js";

@Public()
@Controller("metrics")
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly db: DatabaseService,
  ) {}
  @Get()
  async get(@Res() response: Response) {
    const result = await this.db.query<{
      outbox_pending: string;
      delivery_failures: string;
      data_jobs_queued: string;
    }>(
      `SELECT (SELECT count(*) FROM outbox_events WHERE processed_at IS NULL) outbox_pending,(SELECT count(*) FROM notification_deliveries WHERE status='FAILED') delivery_failures,(SELECT count(*) FROM data_jobs WHERE status IN('QUEUED','PROCESSING')) data_jobs_queued`,
    );
    const row = result.rows[0]!;
    response.type("text/plain; version=0.0.4").send(
      this.metrics.render({
        outboxPending: Number(row.outbox_pending),
        deliveryFailures: Number(row.delivery_failures),
        dataJobsQueued: Number(row.data_jobs_queued),
      }),
    );
  }
}
