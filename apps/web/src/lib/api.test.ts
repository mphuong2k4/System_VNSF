import { describe, expect, it } from "vitest";
import { cookie } from "./api";

describe("cookie", () => {
  it("reads only the requested CSRF cookie", () => {
    expect(
      cookie("vnsf_csrf", "analytics=x; vnsf_csrf=secure-token; other=y"),
    ).toBe("secure-token");
  });
  it("returns an empty value when absent", () => {
    expect(cookie("vnsf_csrf", "other=y")).toBe("");
  });
});
