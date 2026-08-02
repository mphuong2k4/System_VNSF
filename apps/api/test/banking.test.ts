import { describe, expect, it } from "vitest";
import {
  maskAccountName,
  maskAccountNumber,
  normalizeAccountNumber,
} from "../src/modules/banking/banking.service.js";

describe("banking data protection", () => {
  it("normalizes account numbers before encryption and HMAC", () => {
    expect(normalizeAccountNumber(" 0123-456 789 ")).toBe("0123456789");
  });
  it("only exposes the final four account digits", () => {
    expect(maskAccountNumber("0123456789")).toBe("******6789");
  });
  it("masks every account-holder name component", () => {
    expect(maskAccountName("Nguyen Van An")).toBe("N***** V** A*");
  });
});
