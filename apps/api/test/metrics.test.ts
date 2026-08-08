import { describe, expect, it } from "vitest";
import { MetricsService } from "../src/platform/metrics.service.js";

describe("operational metrics", () => {
  it("normalizes UUID path labels and exposes only aggregate gauges", () => {
    const metrics = new MetricsService();
    metrics.observe(
      "GET",
      "/api/v1/students/123e4567-e89b-12d3-a456-426614174000",
      200,
      0.25,
    );
    const output = metrics.render({
      outboxPending: 2,
      deliveryFailures: 1,
      dataJobsQueued: 3,
    });
    expect(output).toContain('route="/api/v1/students/:id"');
    expect(output).not.toContain("123e4567-e89b-12d3-a456-426614174000");
    expect(output).toContain("vnsf_outbox_pending 2");
  });
});
