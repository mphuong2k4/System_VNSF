import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { IdentityService } from "./identity.service.js";
import { AllowPendingMfa, Public } from "./auth.decorators.js";
import type { AuthenticatedRequest } from "./session.guard.js";
const loginSchema = z
  .object({ email: z.string().email(), password: z.string().min(8).max(200) })
  .strict();
const mfaSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
const recoverySchema = z.object({ code: z.string().min(8).max(64) }).strict();
const passwordSchema = z
  .object({ password: z.string().min(12).max(200) })
  .strict();
const tokenPasswordSchema = passwordSchema
  .extend({ token: z.string().min(32).max(200) })
  .strict();
const emailSchema = z.object({ email: z.string().email() }).strict();
const preferenceSchema = z
  .object({ preferred_locale: z.enum(["vi-VN", "en-US"]) })
  .strict();
@Controller("auth")
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}
  @Public()
  @Post("login")
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const value = loginSchema.parse(body);
    const result = await this.identity.login(value.email, value.password);
    this.cookies(res, result.token, result.csrf);
    return { mfa_required: result.mfaRequired, csrf_token: result.csrf };
  }
  @AllowPendingMfa()
  @Post("mfa/verify")
  async mfa(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.identity.verifyMfa(
      this.token(req),
      mfaSchema.parse(body).code,
    );
    this.cookies(res, result.token, result.csrf);
    return { verified: true, csrf_token: result.csrf };
  }
  @AllowPendingMfa()
  @Post("mfa/enroll")
  enroll(@Req() req: Request, @Body() body: unknown) {
    return this.identity.beginMfaEnrollment(
      this.token(req),
      emailSchema.parse(body).email,
    );
  }
  @AllowPendingMfa()
  @Post("mfa/enroll/confirm")
  async confirmEnrollment(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.identity.confirmMfaEnrollment(
      this.token(req),
      mfaSchema.parse(body).code,
    );
    this.cookies(res, result.token, result.csrf);
    return { recovery_codes: result.recovery_codes, csrf_token: result.csrf };
  }
  @AllowPendingMfa()
  @Post("mfa/recovery/verify")
  async recovery(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.identity.verifyRecoveryCode(
      this.token(req),
      recoverySchema.parse(body).code,
    );
    this.cookies(res, result.token, result.csrf);
    return { verified: true, csrf_token: result.csrf };
  }
  @Public()
  @Post("password/forgot")
  forgot(@Body() body: unknown) {
    return this.identity.requestPasswordReset(emailSchema.parse(body).email);
  }
  @Public()
  @Post("password/reset")
  reset(@Body() body: unknown) {
    const value = tokenPasswordSchema.parse(body);
    return this.identity.consumeOneTimeToken(
      "PASSWORD_RESET",
      value.token,
      value.password,
    );
  }
  @Public()
  @Post("activate")
  activate(@Body() body: unknown) {
    const value = tokenPasswordSchema.parse(body);
    return this.identity.consumeOneTimeToken(
      "ACTIVATION",
      value.token,
      value.password,
    );
  }
  @Post("reauthenticate")
  reauthenticate(@Req() req: Request, @Body() body: unknown) {
    return this.identity.reauthenticate(
      this.token(req),
      passwordSchema.parse(body).password,
    );
  }
  @Post("logout") async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.identity.logout(this.token(req));
    res.clearCookie("vnsf_session", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_ENV !== "development",
      path: "/",
    });
    return { logged_out: true };
  }
  @Get("sessions") sessions(@Req() req: Request) {
    return this.identity.listSessions(this.token(req));
  }
  @Delete("sessions/:id") revoke(@Req() req: Request, @Param("id") id: string) {
    return this.identity.revoke(this.token(req), id);
  }
  @Get("profile/preferences")
  preferences(@Req() req: AuthenticatedRequest) {
    return this.identity.preferences(req.auth);
  }
  @Patch("profile/preferences")
  updatePreferences(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.identity.updatePreferences(
      req.auth,
      preferenceSchema.parse(body).preferred_locale,
    );
  }
  private token(req: Request) {
    return String(req.cookies?.vnsf_session ?? "");
  }
  private cookies(res: Response, token: string, csrf: string) {
    res.cookie("vnsf_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_ENV !== "development",
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.cookie("vnsf_csrf", csrf, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.APP_ENV !== "development",
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
    });
  }
}
