import { describe, expect, it } from "vitest";
import { reminderTime } from "./reminders.js";

describe("reminder calendar", () => {
  it("moves pre-deadline weekend reminders to the next working day", () => {
    expect(
      reminderTime(new Date("2026-08-10T02:00:00Z"), -2, []).toISOString(),
    ).toBe("2026-08-10T02:00:00.000Z");
  });
  it("honors an explicit working Saturday and leaves overdue milestones on calendar days", () => {
    const overrides = [
      { calendar_date: "2026-08-08", day_type: "WORKING_DAY" as const },
    ];
    expect(
      reminderTime(
        new Date("2026-08-10T02:00:00Z"),
        -2,
        overrides,
      ).toISOString(),
    ).toBe("2026-08-08T02:00:00.000Z");
    expect(
      reminderTime(new Date("2026-08-10T02:00:00Z"), 7, []).toISOString(),
    ).toBe("2026-08-17T02:00:00.000Z");
  });
});
