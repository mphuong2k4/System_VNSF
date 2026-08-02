import { describe, expect, it } from "vitest";
import {
  approvalTarget,
  assertSeparateReviewers,
  transition,
} from "../src/modules/academics/state-machine.js";
import {
  can,
  effectiveSelfService,
  toActor,
} from "../src/modules/authorization/policy.js";
import { nextWorkingDay } from "../src/modules/configuration/calendar.js";
import { maskContact } from "../src/modules/students/students.service.js";
describe("canonical rules", () => {
  it("fails safe by grade", () => {
    expect(effectiveSelfService(undefined)).toBe("SCHOOL_MANAGED");
    expect(effectiveSelfService(9)).toBe("SCHOOL_MANAGED");
    expect(effectiveSelfService(10)).toBe("STUDENT_MANAGED");
  });
  it("requires reason", () =>
    expect(() => transition("SCHOOL_REVIEW", "RETURNED")).toThrow());
  it("separates reviewers", () =>
    expect(() => assertSeparateReviewers("a", "a")).toThrow());
  it("routes one-level and two-level approvals correctly", () => {
    expect(approvalTarget(1, "ONE_LEVEL")).toBe("APPROVED");
    expect(approvalTarget(1, "TWO_LEVEL")).toBe("PROGRAM_REVIEW");
    expect(approvalTarget(2, "TWO_LEVEL")).toBe("APPROVED");
  });
  it("denies school managers outside their effective school scope", () => {
    const actor = toActor({
      userId: "manager",
      roles: ["SCHOOL_MANAGER"],
      schoolIds: ["school-a"],
      mfaVerified: true,
    });
    expect(can(actor, "student.read", { schoolId: "school-a" })).toBe(true);
    expect(can(actor, "student.read", { schoolId: "school-b" })).toBe(false);
    expect(can(actor, "student.read", {})).toBe(false);
  });
  it("denies administrative access until MFA is verified", () => {
    const actor = toActor({
      userId: "manager",
      roles: ["PROGRAM_MANAGER"],
      schoolIds: [],
      mfaVerified: false,
    });
    expect(can(actor, "student.read", {})).toBe(false);
  });
  it("limits operational configuration to program and super administrators", () => {
    const manager = (role: string) =>
      toActor({
        userId: role,
        roles: [role],
        schoolIds: ["school-a"],
        mfaVerified: true,
      });
    expect(can(manager("PROGRAM_MANAGER"), "configuration.manage", {})).toBe(
      true,
    );
    expect(can(manager("SUPER_ADMIN"), "configuration.manage", {})).toBe(true);
    expect(
      can(manager("SCHOOL_MANAGER"), "configuration.manage", {
        schoolId: "school-a",
      }),
    ).toBe(false);
  });
  it("allows only the linked student to use self-service actions", () => {
    const actor = toActor({
      userId: "student-user",
      roles: ["STUDENT", "UNRECOGNIZED"],
      schoolIds: [],
      studentId: "student-a",
      mfaVerified: true,
    });
    expect(can(actor, "submission.submit", { studentId: "student-a" })).toBe(
      true,
    );
    expect(can(actor, "submission.submit", { studentId: "student-b" })).toBe(
      false,
    );
    expect(
      can(
        toActor({
          userId: "staff",
          roles: ["UNRECOGNIZED"],
          schoolIds: [],
          studentId: "student-a",
          mfaVerified: true,
        }),
        "submission.submit",
        { studentId: "student-a" },
      ),
    ).toBe(false);
  });
  it("moves deadlines over weekends and configured holidays", () => {
    expect(nextWorkingDay("2026-09-05", [])).toBe("2026-09-07");
    expect(
      nextWorkingDay("2026-09-07", [{ date: "2026-09-07", type: "HOLIDAY" }]),
    ).toBe("2026-09-08");
    expect(
      nextWorkingDay("2026-09-06", [
        { date: "2026-09-06", type: "WORKING_DAY" },
      ]),
    ).toBe("2026-09-06");
  });
  it("never returns raw guardian contact details", () => {
    expect(
      maskContact({ phone: "0901234567", email: "parent@example.org" }),
    ).toEqual({
      phone_masked: "******4567",
      email_masked: "p***@example.org",
    });
  });
});
