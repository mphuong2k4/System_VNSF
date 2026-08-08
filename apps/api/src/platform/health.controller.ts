import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { Public } from "../modules/identity/auth.decorators.js";
@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly db: DatabaseService) {}
  @Get("live") live() {
    return { status: "ok" };
  }
  @Get("ready") async ready() {
    try {
      const result = await this.db.query<{ pending: string }>(
        `SELECT count(*) pending FROM outbox_events WHERE processed_at IS NULL AND available_at<now()-interval '10 minutes'`,
      );
      return {
        status: "ok",
        dependencies: { postgres: "ok" },
        stale_outbox_events: Number(result.rows[0]!.pending),
      };
    } catch {
      throw new ServiceUnavailableException("DATABASE_UNAVAILABLE");
    }
  }
}
