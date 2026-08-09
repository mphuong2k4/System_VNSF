import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: Number(__ENV.PERF_VUS || 10),
  duration: __ENV.PERF_DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate==0"],
    http_req_duration: ["p(95)<750"],
  },
};

export default function () {
  const response = http.get(
    `${__ENV.PERF_BASE_URL || "http://127.0.0.1:3000"}/api/v1/health/live`,
  );
  check(response, { "liveness is healthy": (result) => result.status === 200 });
}
