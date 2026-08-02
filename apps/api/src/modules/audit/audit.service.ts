import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
export type AuditInput = {
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  result: "SUCCESS" | "FAILURE";
  correlationId: string;
  before?: unknown;
  after?: unknown;
};
@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}
  async write(event: AuditInput) {
    await this.db.query(
      `INSERT INTO audit_events(actor_id,action,resource_type,resource_id,result,before_redacted,after_redacted,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        event.actorId ?? null,
        event.action,
        event.resourceType,
        event.resourceId ?? null,
        event.result,
        event.before ?? null,
        event.after ?? null,
        event.correlationId,
      ],
    );
  }
}
