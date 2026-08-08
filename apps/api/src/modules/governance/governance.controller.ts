import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../identity/session.guard.js";
import { GovernanceService } from "./governance.service.js";

type CorrelatedRequest = AuthenticatedRequest & { correlationId: string };

@Controller()
export class GovernanceController {
  constructor(private readonly service: GovernanceService) {}

  @Get("audit-events") audit(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.service.audit(request.auth, query);
  }
  @Get("retention/policies") policies(@Req() request: AuthenticatedRequest) {
    return this.service.policies(request.auth);
  }
  @Post("retention/policies") createPolicy(
    @Req() request: CorrelatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.createPolicy(request.auth, request.correlationId, body);
  }
  @Get("retention/dry-runs") dryRuns(@Req() request: AuthenticatedRequest) {
    return this.service.dryRuns(request.auth);
  }
  @Post("retention/dry-runs") createDryRun(
    @Req() request: CorrelatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.createDryRun(request.auth, request.correlationId, body);
  }
  @Post("retention/dry-runs/:id/approve") approveDryRun(
    @Req() request: CorrelatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.approveDryRun(
      request.auth,
      request.correlationId,
      id,
      body,
    );
  }
  @Get("legal-holds") holds(@Req() request: AuthenticatedRequest) {
    return this.service.holds(request.auth);
  }
  @Post("legal-holds") createHold(
    @Req() request: CorrelatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.createHold(request.auth, request.correlationId, body);
  }
  @Patch("legal-holds/:id/release") releaseHold(
    @Req() request: CorrelatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.releaseHold(
      request.auth,
      request.correlationId,
      id,
      body,
    );
  }
  @Get("consent-policies") consentPolicies(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.consentPolicies(request.auth);
  }
  @Post("consent-policies") publishConsent(
    @Req() request: CorrelatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.publishConsent(
      request.auth,
      request.correlationId,
      body,
    );
  }
  @Post("students/:studentId/consents/:policyId") acceptConsent(
    @Req() request: CorrelatedRequest,
    @Param("studentId") studentId: string,
    @Param("policyId") policyId: string,
    @Body() body: unknown,
  ) {
    return this.service.acceptConsent(
      request.auth,
      request.correlationId,
      studentId,
      policyId,
      body,
    );
  }
  @Patch("students/:studentId/consents/:policyId/withdraw") withdrawConsent(
    @Req() request: CorrelatedRequest,
    @Param("studentId") studentId: string,
    @Param("policyId") policyId: string,
    @Body() body: unknown,
  ) {
    return this.service.withdrawConsent(
      request.auth,
      request.correlationId,
      studentId,
      policyId,
      body,
    );
  }
}
