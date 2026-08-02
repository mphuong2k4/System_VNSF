import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { AuthenticatedRequest } from "../identity/session.guard.js";
import { DocumentsService } from "./documents.service.js";
@Controller("documents")
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}
  @Post("upload-init") initiate(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.initiate(request.auth, body);
  }
  @Post(":id/complete") complete(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.service.complete(request.auth, id);
  }
  @Get(":id/download") download(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.service.download(request.auth, id);
  }
}
