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
import { StudentsService } from "./students.service.js";
import type { AuthenticatedRequest } from "../identity/session.guard.js";
@Controller("students")
export class StudentsController {
  constructor(private readonly service: StudentsService) {}
  @Get() list(
    @Req() request: AuthenticatedRequest,
    @Query("page") page = "1",
    @Query("size") size = "20",
  ) {
    return this.service.list(request.auth, Number(page), Number(size));
  }
  @Post() create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.create(request.auth, body);
  }
  @Get("duplicates/check") duplicates(
    @Req() request: AuthenticatedRequest,
    @Query("full_name") fullName: string,
    @Query("date_of_birth") dateOfBirth: string,
  ) {
    return this.service.duplicates(request.auth, fullName, dateOfBirth);
  }
  @Get(":id") get(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.service.get(request.auth, id);
  }
  @Patch(":id") update(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.update(request.auth, id, etag, body);
  }
  @Get(":id/guardians") guardians(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.service.guardians(request.auth, id);
  }
  @Post(":id/guardians") addGuardian(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.addGuardian(request.auth, id, body);
  }
  @Get(":id/school-history") history(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.service.history(request.auth, id);
  }
  @Post(":id/school-transfer") transfer(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.transfer(request.auth, id, etag, body);
  }
  @Get(":id/identity") identity(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.service.identity(request.auth, id);
  }
  @Patch(":id/identity") updateIdentity(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.updateIdentity(request.auth, id, etag, body);
  }
  @Post(":id/identity/reveal") revealIdentity(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.revealIdentity(request.auth, id, body);
  }
}
