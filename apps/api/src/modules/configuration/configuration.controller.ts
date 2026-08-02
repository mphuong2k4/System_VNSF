import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../identity/session.guard.js";
import { ConfigurationService } from "./configuration.service.js";
import { DomainError } from "../../platform/error.filter.js";

const kinds = ["schools", "programs", "periods", "calendar"] as const;
type Kind = (typeof kinds)[number];
function kind(value: string): Kind {
  if (!kinds.includes(value as Kind))
    throw new DomainError("RESOURCE_NOT_FOUND", 404);
  return value as Kind;
}
@Controller("configuration")
export class ConfigurationController {
  constructor(private readonly service: ConfigurationService) {}
  @Get(":kind") list(
    @Req() request: AuthenticatedRequest,
    @Param("kind") value: string,
  ) {
    return this.service.list(request.auth, kind(value));
  }
  @Post(":kind") create(
    @Req() request: AuthenticatedRequest,
    @Param("kind") value: string,
    @Body() body: unknown,
  ) {
    return this.service.create(request.auth, kind(value), body);
  }
  @Patch(":kind/:id") update(
    @Req() request: AuthenticatedRequest,
    @Param("kind") value: string,
    @Param("id") id: string,
    @Headers("if-match") etag: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.update(request.auth, kind(value), id, etag, body);
  }
}
