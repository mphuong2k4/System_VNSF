import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../identity/session.guard.js";
import { AssistanceService } from "./assistance.service.js";

@Controller("students/:studentId")
export class AssistanceController {
  constructor(private readonly service: AssistanceService) {}
  @Get("education-expenses/:academicYear") expense(
    @Req() req: AuthenticatedRequest,
    @Param("studentId") studentId: string,
    @Param("academicYear") year: string,
  ) {
    return this.service.getExpense(req.auth, studentId, year);
  }
  @Put("education-expenses/:academicYear") saveExpense(
    @Req() req: AuthenticatedRequest,
    @Param("studentId") studentId: string,
    @Param("academicYear") year: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.saveExpense(req.auth, studentId, year, etag, body);
  }
  @Post("education-expenses/:academicYear/:action") expenseAction(
    @Req() req: AuthenticatedRequest,
    @Param("studentId") studentId: string,
    @Param("academicYear") year: string,
    @Param("action") action: string,
    @Headers("if-match") etag: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.expenseAction(
      req.auth,
      studentId,
      year,
      action,
      etag,
      key,
      body,
      String(req.header("x-correlation-id") ?? randomUUID()),
    );
  }
  @Get("support-programs") supports(
    @Req() req: AuthenticatedRequest,
    @Param("studentId") studentId: string,
  ) {
    return this.service.listSupports(req.auth, studentId);
  }
  @Get("support-programs/catalog") supportCatalog(
    @Req() req: AuthenticatedRequest,
    @Param("studentId") studentId: string,
  ) {
    return this.service.supportCatalog(req.auth, studentId);
  }
  @Post("support-programs") addSupport(
    @Req() req: AuthenticatedRequest,
    @Param("studentId") studentId: string,
    @Body() body: unknown,
  ) {
    return this.service.addSupport(req.auth, studentId, body);
  }
  @Put("support-programs/:id") updateSupport(
    @Req() req: AuthenticatedRequest,
    @Param("studentId") studentId: string,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.updateSupport(req.auth, studentId, id, etag, body);
  }
  @Delete("support-programs/:id") archiveSupport(
    @Req() req: AuthenticatedRequest,
    @Param("studentId") studentId: string,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
  ) {
    return this.service.archiveSupport(req.auth, studentId, id, etag);
  }
}
