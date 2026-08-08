import { Injectable } from "@nestjs/common";

@Injectable()
export class MetricsService {
  private readonly requests = new Map<string, number>();
  private requestSeconds = 0;
  private requestCount = 0;
  observe(method: string, route: string, status: number, seconds: number) {
    const safeRoute = route.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
    const key = `${method}|${safeRoute}|${status}`;
    this.requests.set(key, (this.requests.get(key) ?? 0) + 1);
    this.requestSeconds += seconds;
    this.requestCount += 1;
  }
  render(gauges: {
    outboxPending: number;
    deliveryFailures: number;
    dataJobsQueued: number;
  }) {
    const lines = [
      "# HELP vnsf_http_requests_total HTTP requests handled by the API.",
      "# TYPE vnsf_http_requests_total counter",
    ];
    for (const [key, value] of this.requests) {
      const [method, route, status] = key.split("|");
      lines.push(
        `vnsf_http_requests_total{method="${method}",route="${route}",status="${status}"} ${value}`,
      );
    }
    lines.push(
      "# TYPE vnsf_http_request_duration_seconds_sum counter",
      `vnsf_http_request_duration_seconds_sum ${this.requestSeconds}`,
      "# TYPE vnsf_http_request_duration_seconds_count counter",
      `vnsf_http_request_duration_seconds_count ${this.requestCount}`,
      "# TYPE vnsf_outbox_pending gauge",
      `vnsf_outbox_pending ${gauges.outboxPending}`,
      "# TYPE vnsf_notification_delivery_failures gauge",
      `vnsf_notification_delivery_failures ${gauges.deliveryFailures}`,
      "# TYPE vnsf_data_jobs_queued gauge",
      `vnsf_data_jobs_queued ${gauges.dataJobsQueued}`,
    );
    return `${lines.join("\n")}\n`;
  }
}
