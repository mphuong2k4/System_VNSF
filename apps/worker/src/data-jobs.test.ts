import { describe, expect, it } from "vitest";
import { csv, csvCell } from "./data-jobs.js";

describe("CSV export hardening", () => {
  it("neutralizes spreadsheet formulas and escapes quotes", () => {
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(csvCell("+1")).toBe('"\'+1"');
  });
  it("emits UTF-8 BOM and CRLF rows", () => {
    expect(csv(["name"], [["An"]])).toBe('\uFEFF"name"\r\n"An"\r\n');
  });
});
