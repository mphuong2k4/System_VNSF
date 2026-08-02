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
import { TransfersService } from "./transfers.service.js";

@Controller("manual-transfers")
export class TransfersController {
  constructor(private readonly service: TransfersService) {}
  @Get() list(
    @Req() request: AuthenticatedRequest,
    @Query("page") page = "1",
    @Query("size") size = "20",
  ) {
    return this.service.list(request.auth, Number(page), Number(size));
  }
  @Post() create(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.create(request.auth, key, body);
  }
  @Get(":id") get(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.service.get(request.auth, id);
  }
  @Post(":id/confirm") confirm(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.confirm(request.auth, id, key, body);
  }
  @Post(":id/corrections") correct(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.correct(request.auth, id, etag, key, body);
  }
}
