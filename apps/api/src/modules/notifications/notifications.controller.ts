import { Controller, Get, Param, Patch, Query, Req } from "@nestjs/common";
import type { AuthenticatedRequest } from "../identity/session.guard.js";
import { NotificationsService } from "./notifications.service.js";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query("unread") unread = "false",
    @Query("limit") limit = "50",
  ) {
    return this.service.list(request.auth, unread === "true", limit);
  }

  @Get("unread-count")
  unreadCount(@Req() request: AuthenticatedRequest) {
    return this.service.unreadCount(request.auth);
  }

  @Patch(":id/read")
  markRead(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.markRead(request.auth, id);
  }

  @Patch("read-all")
  markAllRead(@Req() request: AuthenticatedRequest) {
    return this.service.markAllRead(request.auth);
  }
}
