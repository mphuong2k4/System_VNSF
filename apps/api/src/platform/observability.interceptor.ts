import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { finalize } from "rxjs/operators";
import { MetricsService } from "./metrics.service.js";

type CorrelatedRequest = Request & { correlationId?: string };
@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  private readonly logger = new Logger("http");
  constructor(private readonly metrics: MetricsService) {}
  intercept(context: ExecutionContext, next: CallHandler<unknown>) {
    const request = context.switchToHttp().getRequest<CorrelatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const started = process.hrtime.bigint();
    return next.handle().pipe(
      finalize(() => {
        const duration = Number(process.hrtime.bigint() - started) / 1e9;
        const routeDefinition = request.route as { path?: unknown } | undefined;
        const routePath =
          typeof routeDefinition?.path === "string"
            ? routeDefinition.path
            : undefined;
        const route = routePath
          ? `${request.baseUrl}${routePath}`
          : request.path;
        this.metrics.observe(
          request.method,
          route,
          response.statusCode,
          duration,
        );
        this.logger.log(
          JSON.stringify({
            event: "http_request",
            correlation_id: request.correlationId,
            method: request.method,
            route,
            status: response.statusCode,
            duration_ms: Math.round(duration * 1000),
          }),
        );
      }),
    );
  }
}
