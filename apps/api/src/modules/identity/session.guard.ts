import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { loadConfig } from "@vnsf/config";
import { createHmac } from "node:crypto";
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
export function ratePolicy(method: string, path: string) {
  if (method.toUpperCase() !== "POST") return undefined;
  if (path.endsWith("/auth/login")) return { limit: 10, windowSeconds: 60 };
  if (path.endsWith("/auth/password/forgot"))
    return { limit: 5, windowSeconds: 900 };
  if (/\/auth\/(?:password\/reset|activate)$/.test(path))
    return { limit: 10, windowSeconds: 900 };
  if (path.endsWith("/auth/reauthenticate"))
    return { limit: 10, windowSeconds: 60 };
  if (/\/manual-transfers\/[^/]+\/confirm$/.test(path))
    return { limit: 10, windowSeconds: 60 };
  if (path.endsWith("/exports")) return { limit: 10, windowSeconds: 60 };
  return undefined;
}

@Injectable()
export class SessionGuard implements CanActivate {
  private readonly config = loadConfig();
  private readonly appOrigin = new URL(this.config.APP_BASE_URL).origin;
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
      await this.applyRateLimit(request);
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
    await this.applyRateLimit(request, request.auth.userId);
    return true;
  }
  private async applyRateLimit(request: Request, actorId?: string) {
    const policy = ratePolicy(request.method, request.path);
    if (!policy) return;
    const subject =
      actorId ?? request.ip ?? request.socket.remoteAddress ?? "unknown";
    const scopeKey = createHmac("sha256", this.config.SESSION_SECRET_CURRENT)
      .update(`${request.method.toUpperCase()}:${request.path}:${subject}`)
      .digest("hex");
    await this.identity.enforceRateLimit(
      scopeKey,
      policy.limit,
      policy.windowSeconds,
    );
  }
}
