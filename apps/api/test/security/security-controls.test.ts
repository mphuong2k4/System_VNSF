import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../src/database/database.service.js";
import { can, toActor } from "../../src/modules/authorization/policy.js";
import { DocumentsService } from "../../src/modules/documents/documents.service.js";
import type { ObjectStorageService } from "../../src/modules/documents/object-storage.service.js";
import {
  originAllowed,
  ratePolicy,
} from "../../src/modules/identity/session.guard.js";

beforeAll(() => {
  Object.assign(process.env, {
    APP_ENV: "test",
    APP_BASE_URL: "http://localhost:5173",
    PORT: "3000",
    APP_TIMEZONE: "Asia/Ho_Chi_Minh",
    SUPPORTED_LOCALES: "vi-VN,en-US",
    DATABASE_URL: "postgresql://test:test@localhost/test",
    REDIS_URL: "redis://localhost:6379",
    SESSION_SECRET_CURRENT: "current-session-secret-at-least-32-characters",
    SESSION_SECRET_PREVIOUS: "previous-session-secret-at-least-32-chars",
    FIELD_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
    FIELD_HMAC_KEY_BASE64: Buffer.alloc(32, 9).toString("base64"),
    OBJECT_STORAGE_ENDPOINT: "http://localhost:9000",
    OBJECT_STORAGE_BUCKET: "vnsf-test",
    OBJECT_STORAGE_ACCESS_KEY: "testing",
    OBJECT_STORAGE_SECRET_KEY: "testing-secret",
    EMAIL_PROVIDER: "smtp",
    EMAIL_FROM: "test@vnsf.local",
    SMTP_URL: "smtp://localhost:1025",
  });
});

describe("security regression controls", () => {
  it("denies IDOR access outside effective school and student scope", () => {
    const schoolManager = toActor({
      userId: "manager",
      roles: ["SCHOOL_MANAGER"],
      schoolIds: ["school-a"],
      mfaVerified: true,
    });
    const student = toActor({
      userId: "student-user",
      roles: ["STUDENT"],
      schoolIds: [],
      studentId: "student-a",
      mfaVerified: true,
    });
    expect(can(schoolManager, "student.read", { schoolId: "school-b" })).toBe(
      false,
    );
    expect(can(student, "student.self", { studentId: "student-b" })).toBe(
      false,
    );
  });

  it("requires exact origins and rate limits sensitive endpoints", () => {
    expect(originAllowed("https://evil.test", "https://vnsf.test")).toBe(false);
    expect(ratePolicy("POST", "/api/v1/auth/login")).toEqual({
      limit: 10,
      windowSeconds: 60,
    });
    expect(ratePolicy("GET", "/api/v1/auth/login")).toBeUndefined();
    expect(
      ratePolicy("POST", "/api/v1/manual-transfers/id/confirm"),
    ).toBeDefined();
  });

  it("rejects uploaded content whose bytes do not match the declared checksum", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "document-id",
            object_key: "quarantine/document-id",
            promoted_key: null,
            checksum: "0".repeat(64),
            size_bytes: "4",
            mime_type: "application/pdf",
            scan_status: "PENDING",
            storage_status: "QUARANTINED",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ owner_type: "STUDENT", owner_id: "student-id" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            student_id: "student-id",
            school_id: "school-id",
            grade_level_current: 10,
            expense_status: null,
          },
        ],
      });
    const database = { query } as unknown as DatabaseService;
    const storage = {
      head: vi.fn().mockResolvedValue({
        ContentLength: 4,
        Metadata: { "expected-sha256": "0".repeat(64) },
      }),
      read: vi.fn().mockResolvedValue(Buffer.from("evil")),
    } as unknown as ObjectStorageService;
    const service = new DocumentsService(database, storage);
    await expect(
      service.complete(
        {
          sessionId: "session-id",
          userId: "student-user",
          roles: ["STUDENT"],
          schoolIds: [],
          studentId: "student-id",
          mfaVerified: true,
        },
        "document-id",
      ),
    ).rejects.toMatchObject({ code: "FILE_INTEGRITY_MISMATCH", status: 422 });
  });
});
