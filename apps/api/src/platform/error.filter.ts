import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodError } from "zod";

type CorrelatedRequest = Request & { correlationId?: string };

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<CorrelatedRequest>();
    const status =
      error instanceof DomainError
        ? error.status
        : error instanceof ZodError
          ? 422
          : error instanceof HttpException
            ? error.getStatus()
            : 500;
    const code =
      error instanceof DomainError
        ? error.code
        : error instanceof ZodError
          ? "VALIDATION_FAILED"
          : status === 500
            ? "INTERNAL_ERROR"
            : "REQUEST_REJECTED";
    if (status >= 500) {
      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : "Unknown non-error exception";
      this.logger.error(
        JSON.stringify({
          event: "unhandled_request_error",
          correlation_id: request.correlationId,
          method: request.method,
          route: request.originalUrl?.split("?")[0],
          detail,
        }),
      );
    }
    response.status(status).json({
      code,
      message_key: `errors.${code}`,
      field_errors:
        error instanceof ZodError
          ? error.issues.map((issue) => ({
              field: issue.path.join("."),
              code: issue.code,
            }))
          : [],
      correlation_id: request.correlationId,
    });
  }
}

export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
