import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { AcademicsService } from "./academics.service.js";
import type { AuthenticatedRequest } from "../identity/session.guard.js";
@Controller("submissions")
export class AcademicsController {
  constructor(private readonly service: AcademicsService) {}
  @Get() list(
    @Req() request: AuthenticatedRequest,
    @Query("queue") queue = "false",
  ) {
    return this.service.list(request.auth, queue === "true");
  }
  @Post() create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.create(request.auth, body);
  }
  @Patch(":id/draft") saveDraft(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.saveDraft(request.auth, id, etag, body);
  }
  @Post(":id/submit") submit(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: { version?: number },
  ) {
    return this.service.submit(request.auth, id, key, body.version);
  }
  @Post(":id/review") review(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.review(request.auth, id, etag, body);
  }
}
