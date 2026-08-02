import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { loadConfig } from "@vnsf/config";
import { DomainError } from "../../platform/error.filter.js";
import { ALLOW_PENDING_MFA, IS_PUBLIC } from "./auth.decorators.js";
import { IdentityService } from "./identity.service.js";

export type AuthContext = {
  sessionId: string;
  userId: string;
  roles: string[];
  schoolIds: string[];
  studentId?: string;
  mfaVerified: boolean;
};
export type AuthenticatedRequest = Request & { auth: AuthContext };
export const isSafeMethod = (method: string) =>
  ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
export const originAllowed = (origin: string | undefined, expected: string) =>
  origin === expected;

@Injectable()
export class SessionGuard implements CanActivate {
  private readonly appOrigin = new URL(loadConfig().APP_BASE_URL).origin;
  constructor(
    private readonly reflector: Reflector,
    private readonly identity: IdentityService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (isPublic) {
      if (
        !isSafeMethod(request.method) &&
        !originAllowed(request.header("origin"), this.appOrigin)
      )
        throw new DomainError("ORIGIN_INVALID", 403);
      return true;
    }
    request.auth = await this.identity.authenticate(
      String(request.cookies?.vnsf_session ?? ""),
      request.method,
      String(request.header("x-csrf-token") ?? ""),
      String(request.cookies?.vnsf_csrf ?? ""),
    );
    const allowPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_MFA,
      [context.getHandler(), context.getClass()],
    );
    if (!allowPending && !request.auth.mfaVerified)
      throw new DomainError("AUTH_MFA_REQUIRED", 401);
    return true;
  }
}
