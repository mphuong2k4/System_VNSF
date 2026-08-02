import { DomainError } from "../../platform/error.filter.js";
export type SubmissionState =
  | "DRAFT"
  | "SCHOOL_REVIEW"
  | "PROGRAM_REVIEW"
  | "RETURNED"
  | "REJECTED"
  | "APPROVED"
  | "LOCKED";
const transitions: Record<SubmissionState, readonly SubmissionState[]> = {
  DRAFT: ["SCHOOL_REVIEW"],
  SCHOOL_REVIEW: ["RETURNED", "REJECTED", "PROGRAM_REVIEW", "APPROVED"],
  PROGRAM_REVIEW: ["RETURNED", "REJECTED", "APPROVED"],
  RETURNED: ["SCHOOL_REVIEW"],
  REJECTED: [],
  APPROVED: ["LOCKED"],
  LOCKED: [],
};
export function transition(
  from: SubmissionState,
  to: SubmissionState,
  reason?: string,
) {
  if (!transitions[from].includes(to))
    throw new DomainError("INVALID_STATE_TRANSITION", 409);
  if ((to === "RETURNED" || to === "REJECTED") && !reason?.trim())
    throw new DomainError("REASON_REQUIRED", 422);
  return to;
}
export function assertSeparateReviewers(first: string, final: string) {
  if (first === final)
    throw new DomainError("REVIEWER_SEPARATION_REQUIRED", 409);
}
export function approvalTarget(
  level: 1 | 2,
  workflow: "ONE_LEVEL" | "TWO_LEVEL",
): SubmissionState {
  return level === 1 && workflow === "TWO_LEVEL"
    ? "PROGRAM_REVIEW"
    : "APPROVED";
}
