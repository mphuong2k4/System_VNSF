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
import type { AuthenticatedRequest } from "../identity/session.guard.js";
import { ObligationsService } from "./obligations.service.js";

@Controller()
export class ObligationsController {
  constructor(private readonly service: ObligationsService) {}

  @Get("extension-requests")
  listExtensions(@Req() request: AuthenticatedRequest) {
    return this.service.listExtensions(request.auth);
  }

  @Post("obligations/:id/extension-requests")
  requestExtension(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.requestExtension(request.auth, id, body);
  }

  @Post("extension-requests/:id/decision")
  decideExtension(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.decideExtension(request.auth, id, etag, body);
  }

  @Get("thank-you-letters")
  listLetters(
    @Req() request: AuthenticatedRequest,
    @Query("queue") queue = "false",
  ) {
    return this.service.listLetters(request.auth, queue === "true");
  }

  @Post("thank-you-letters")
  createLetter(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.createLetter(request.auth, body);
  }

  @Patch("thank-you-letters/:id/draft")
  saveLetter(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.saveLetter(request.auth, id, etag, body);
  }

  @Post("thank-you-letters/:id/submit")
  submitLetter(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
  ) {
    return this.service.submitLetter(request.auth, id, etag);
  }

  @Post("thank-you-letters/:id/review")
  reviewLetter(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.reviewLetter(request.auth, id, etag, body);
  }
}
