import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/database/database.service.js";
import type { AuthContext } from "../../src/modules/identity/session.guard.js";
import { NotificationsService } from "../../src/modules/notifications/notifications.service.js";

const suite = process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;
suite("notification inbox ownership", () => {
  const owner = randomUUID();
  const stranger = randomUUID();
  const notification = randomUUID();
  let db: DatabaseService;
  let service: NotificationsService;
  const auth: AuthContext = {
    sessionId: randomUUID(),
    userId: owner,
    roles: ["STUDENT"],
    schoolIds: [],
    mfaVerified: true,
  };
  beforeAll(async () => {
    db = new DatabaseService();
    service = new NotificationsService(db);
    await db.query(
      `INSERT INTO users(id,email,password_hash,status) VALUES($1,$2,'x','ACTIVE'),($3,$4,'x','ACTIVE')`,
      [owner, `${owner}@test.local`, stranger, `${stranger}@test.local`],
    );
    await db.query(
      `INSERT INTO notifications(id,user_id,type,payload) VALUES($1,$2,'academic.reminder','{}'),($3,$4,'academic.reminder','{}')`,
      [notification, owner, randomUUID(), stranger],
    );
  });
  afterAll(async () => db.onModuleDestroy());
  it("lists and marks only notifications owned by the session user", async () => {
    expect(await service.unreadCount(auth)).toEqual({ count: 1 });
    expect(await service.list(auth, true, "10")).toHaveLength(1);
    await expect(service.markRead(auth, randomUUID())).rejects.toThrow(
      "RESOURCE_NOT_FOUND",
    );
    expect((await service.markRead(auth, notification)).id).toBe(notification);
    expect(await service.unreadCount(auth)).toEqual({ count: 0 });
  });
});
