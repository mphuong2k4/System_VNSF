import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../src/database/database.service.js";
import { AcademicsService } from "../src/modules/academics/academics.service.js";
import type { AuthContext } from "../src/modules/identity/session.guard.js";

describe("academic payload validation", () => {
  const auth: AuthContext = {
    sessionId: "session",
    userId: "user",
    roles: ["STUDENT"],
    schoolIds: [],
    studentId: "00000000-0000-4000-8000-000000000001",
    mfaVerified: true,
  };
  const query = vi.fn();
  const database = { query } as unknown as DatabaseService;
  const service = new AcademicsService(database);

  it("rejects a GPA above its declared scale before persistence", async () => {
    await expect(
      service.saveDraft(auth, "submission", "1", {
        payload: {
          academic_year: "2025-2026",
          term: "1",
          gpa_value: 11,
          gpa_scale: 10,
        },
      }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects arbitrary unversioned payload fields", async () => {
    await expect(
      service.saveDraft(auth, "submission", "1", {
        payload: { gpa: 999, scale: "unknown" },
      }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
