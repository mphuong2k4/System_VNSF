import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../identity/session.guard.js";
import { ReportingService } from "./reporting.service.js";

@Controller()
export class ReportingController {
  constructor(private readonly service: ReportingService) {}

  @Get("dashboard") dashboard(@Req() request: AuthenticatedRequest) {
    return this.service.dashboard(request.auth);
  }

  @Get("reports/scholarship-summary") summary(
    @Req() request: AuthenticatedRequest,
    @Query("school_id") schoolId?: string,
  ) {
    return this.service.summary(request.auth, schoolId);
  }

  @Get("data-jobs") list(@Req() request: AuthenticatedRequest) {
    return this.service.listJobs(request.auth);
  }

  @Get("data-jobs/:id") get(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.service.getJob(request.auth, id);
  }

  @Post("exports") exportData(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.createExport(request.auth, key, body);
  }

  @Post("imports/students") importStudents(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.createStudentImport(request.auth, key, body);
  }

  @Post("imports/:id/confirm") confirmImport(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.service.confirmImport(request.auth, id, key);
  }
}
