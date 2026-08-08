import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import type { AuthContext } from "../identity/session.guard.js";

const limitSchema = z.coerce.number().int().min(1).max(100);

type NotificationRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  resource_type: string | null;
  resource_id: string | null;
  read_at: Date | null;
  created_at: Date;
  email_status: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async list(auth: AuthContext, unread: boolean, rawLimit: string) {
    const limit = limitSchema.parse(rawLimit);
    return (
      await this.db.query<NotificationRow>(
        `SELECT n.id,n.type,n.payload,n.resource_type,n.resource_id,n.read_at,n.created_at,
                d.status email_status
         FROM notifications n
         LEFT JOIN notification_deliveries d ON d.notification_id=n.id AND d.channel='EMAIL'
         WHERE n.user_id=$1 AND (NOT $2::boolean OR n.read_at IS NULL)
         ORDER BY n.created_at DESC LIMIT $3`,
        [auth.userId, unread, limit],
      )
    ).rows;
  }

  async unreadCount(auth: AuthContext) {
    const result = await this.db.query<{ count: string }>(
      `SELECT count(*)::text count FROM notifications WHERE user_id=$1 AND read_at IS NULL`,
      [auth.userId],
    );
    return { count: Number(result.rows[0]?.count ?? 0) };
  }

  async markRead(auth: AuthContext, id: string) {
    const result = await this.db.query<{ id: string; read_at: Date }>(
      `UPDATE notifications SET read_at=COALESCE(read_at,now())
       WHERE id=$1 AND user_id=$2 RETURNING id,read_at`,
      [id, auth.userId],
    );
    if (!result.rows[0]) throw new DomainError("RESOURCE_NOT_FOUND", 404);
    return result.rows[0];
  }

  async markAllRead(auth: AuthContext) {
    const result = await this.db.query(
      `UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`,
      [auth.userId],
    );
    return { updated: result.rowCount ?? 0 };
  }
}
