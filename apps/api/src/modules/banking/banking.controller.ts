import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Put,
  Req,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../identity/session.guard.js";
import { BankingService } from "./banking.service.js";

@Controller("students/:studentId/bank-account")
export class BankingController {
  constructor(private readonly service: BankingService) {}

  @Get()
  get(
    @Req() request: AuthenticatedRequest,
    @Param("studentId") studentId: string,
  ) {
    return this.service.get(request.auth, studentId);
  }

  @Put()
  save(
    @Req() request: AuthenticatedRequest,
    @Param("studentId") studentId: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    const correlationId = String(
      request.header("x-correlation-id") ?? randomUUID(),
    );
    return this.service.save(
      request.auth,
      studentId,
      etag,
      body,
      correlationId,
    );
  }

  @Patch("review")
  review(
    @Req() request: AuthenticatedRequest,
    @Param("studentId") studentId: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.review(request.auth, studentId, etag, body);
  }

  @Patch("reveal")
  reveal(
    @Req() request: AuthenticatedRequest,
    @Param("studentId") studentId: string,
    @Body() body: unknown,
  ) {
    const correlationId = String(
      request.header("x-correlation-id") ?? randomUUID(),
    );
    return this.service.reveal(request.auth, studentId, body, correlationId);
  }
}
