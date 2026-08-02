import { beforeAll, describe, expect, it } from "vitest";
import { CryptoService } from "../src/modules/identity/crypto.service.js";
import {
  isSafeMethod,
  originAllowed,
} from "../src/modules/identity/session.guard.js";

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

describe("identity cryptography", () => {
  it("encrypts with randomized authenticated ciphertext", () => {
    const crypto = new CryptoService();
    const first = crypto.encrypt("sensitive");
    const second = crypto.encrypt("sensitive");
    expect(first.equals(second)).toBe(false);
    expect(crypto.decrypt(first)).toBe("sensitive");
    expect(crypto.decrypt(second)).toBe("sensitive");
  });
  it("creates deterministic keyed match values", () => {
    const crypto = new CryptoService();
    expect(crypto.hash("0123456789")).toBe(crypto.hash("0123456789"));
    expect(crypto.hash("0123456789")).not.toBe(crypto.hash("9876543210"));
  });
});

describe("request boundary", () => {
  it("recognizes only safe HTTP methods", () => {
    expect(isSafeMethod("GET")).toBe(true);
    expect(isSafeMethod("post")).toBe(false);
  });
  it("requires an exact trusted origin", () => {
    expect(originAllowed("https://vnsf.example", "https://vnsf.example")).toBe(
      true,
    );
    expect(originAllowed("https://evil.example", "https://vnsf.example")).toBe(
      false,
    );
    expect(originAllowed(undefined, "https://vnsf.example")).toBe(false);
  });
});
