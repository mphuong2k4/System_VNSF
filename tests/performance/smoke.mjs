import { performance } from "node:perf_hooks";

const baseUrl = (process.env.PERF_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const requests = Number(process.env.PERF_REQUESTS ?? 100);
const concurrency = Number(process.env.PERF_CONCURRENCY ?? 10);
const p95LimitMs = Number(process.env.PERF_P95_MS ?? 750);
if (
  ![requests, concurrency, p95LimitMs].every(Number.isFinite) ||
  requests < 1 ||
  concurrency < 1
) {
  throw new Error("Performance settings must be positive numbers");
}

const durations = [];
let failures = 0;
let cursor = 0;
async function worker() {
  while (cursor < requests) {
    cursor += 1;
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}/api/v1/health/live`);
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      durations.push(performance.now() - started);
    }
  }
}
await Promise.all(
  Array.from({ length: Math.min(concurrency, requests) }, worker),
);
durations.sort((a, b) => a - b);
const percentile =
  durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)];
const average =
  durations.reduce((sum, value) => sum + value, 0) / durations.length;
console.log(
  JSON.stringify({
    requests,
    concurrency,
    failures,
    average_ms: +average.toFixed(2),
    p95_ms: +percentile.toFixed(2),
    threshold_ms: p95LimitMs,
  }),
);
if (failures > 0 || percentile > p95LimitMs) process.exitCode = 1;
