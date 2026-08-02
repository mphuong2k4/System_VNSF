import { describe, expect, it } from "vitest";
import { transferResultState } from "../src/modules/transfers/transfers.service.js";

describe("manual transfer workflow", () => {
  it("closes a received confirmation", () =>
    expect(transferResultState("RECEIVED")).toBe("RECEIVED"));
  it("opens investigation for a not-received confirmation", () =>
    expect(transferResultState("NOT_RECEIVED")).toBe("UNDER_INVESTIGATION"));
});
