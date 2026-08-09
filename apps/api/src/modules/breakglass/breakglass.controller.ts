import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../identity/session.guard.js";
import { BreakGlassService } from "./breakglass.service.js";

@Controller("break-glass")
export class BreakGlassController {
  constructor(private readonly service: BreakGlassService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.service.list(request.auth);
  }

  @Post()
  start(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.start(request.auth, body);
  }

  @Delete(":id")
  end(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.end(request.auth, id, body);
  }
}
