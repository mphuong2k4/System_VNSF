import { describe, expect, it } from "vitest";
import { expenseTarget } from "../src/modules/assistance/assistance.service.js";

describe("education expense workflow", () => {
  it("supports draft, review and correction transitions", () => {
    expect(expenseTarget("DRAFT", "SUBMIT")).toBe("SUBMITTED");
    expect(expenseTarget("SUBMITTED", "CONFIRM")).toBe("CONFIRMED");
    expect(expenseTarget("CONFIRMED", "CORRECT")).toBe("DRAFT");
  });
  it("rejects a silent confirmed edit transition", () =>
    expect(() => expenseTarget("CONFIRMED", "SUBMIT")).toThrow(
      "INVALID_STATE_TRANSITION",
    ));
});
