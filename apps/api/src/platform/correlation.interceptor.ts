import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { map } from "rxjs/operators";

type CorrelatedRequest = Request & { correlationId: string };

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<unknown>) {
    const request = context.switchToHttp().getRequest<CorrelatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const supplied = request.header("x-correlation-id");
    request.correlationId =
      supplied && /^[0-9a-f-]{36}$/i.test(supplied) ? supplied : randomUUID();
    response.setHeader("x-correlation-id", request.correlationId);
    return next.handle().pipe(
      map((data: unknown) => ({
        data,
        meta: { correlation_id: request.correlationId },
      })),
    );
  }
}
