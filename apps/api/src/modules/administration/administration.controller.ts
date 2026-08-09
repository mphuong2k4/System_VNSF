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
import { AdministrationService } from "./administration.service.js";

@Controller("administration")
export class AdministrationController {
  constructor(private readonly service: AdministrationService) {}

  @Get("users")
  list(@Req() request: AuthenticatedRequest, @Query("q") query = "") {
    return this.service.list(request.auth, query);
  }

  @Post("users")
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.create(request.auth, body);
  }

  @Patch("users/:id")
  update(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.update(request.auth, id, etag, body);
  }

  @Get("roles")
  roles(@Req() request: AuthenticatedRequest) {
    return this.service.roles(request.auth);
  }

  @Get("schools")
  schools(@Req() request: AuthenticatedRequest) {
    return this.service.schools(request.auth);
  }
}
