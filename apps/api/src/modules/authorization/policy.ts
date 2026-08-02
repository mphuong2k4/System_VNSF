export type Role =
  | "SUPER_ADMIN"
  | "PROGRAM_MANAGER"
  | "SCHOOL_MANAGER"
  | "STUDENT";
export type Actor = {
  id: string;
  roles: Role[];
  schoolIds: string[];
  studentId?: string;
  mfa: boolean;
  breakGlassUntil?: Date;
};
export type Resource = {
  schoolId?: string;
  studentId?: string;
  state?: string;
};
const grants: Record<Role, ReadonlySet<string>> = {
  SUPER_ADMIN: new Set([
    "audit.read",
    "user.admin",
    "breakglass.use",
    "student.read",
    "student.write",
    "guardian.write",
    "submission.review.final",
    "submission.review.school",
    "transfer.write",
    "transfer.read",
    "bank.verify",
    "report.export",
    "configuration.manage",
    "expense.read",
    "expense.write",
    "expense.review",
    "support.read",
    "support.write",
  ]),
  PROGRAM_MANAGER: new Set([
    "student.read",
    "student.write",
    "guardian.write",
    "submission.review.final",
    "transfer.write",
    "transfer.read",
    "bank.verify",
    "report.export",
    "configuration.manage",
    "expense.read",
    "expense.write",
    "expense.review",
    "support.read",
    "support.write",
  ]),
  SCHOOL_MANAGER: new Set([
    "student.read",
    "student.write",
    "guardian.write",
    "submission.submit",
    "submission.review.school",
    "transfer.read",
    "expense.read",
    "expense.write",
    "support.read",
    "support.write",
  ]),
  STUDENT: new Set([
    "student.self",
    "submission.submit",
    "transfer.confirm",
    "transfer.read",
    "expense.read",
    "expense.write",
    "support.read",
    "support.write",
    "bank.self",
  ]),
};
export function can(actor: Actor, action: string, resource: Resource): boolean {
  if (!actor.mfa && actor.roles.some((r) => r !== "STUDENT")) return false;
  if (
    actor.roles.includes("STUDENT") &&
    resource.studentId === actor.studentId &&
    grants.STUDENT.has(action)
  )
    return true;
  return actor.roles.some(
    (role) =>
      grants[role].has(action) &&
      (role !== "STUDENT" ||
        (!!actor.studentId && resource.studentId === actor.studentId)) &&
      (role !== "SCHOOL_MANAGER" ||
        (!!resource.schoolId && actor.schoolIds.includes(resource.schoolId))),
  );
}
export function isRole(value: string): value is Role {
  return value in grants;
}
export function toActor(input: {
  userId: string;
  roles: string[];
  schoolIds: string[];
  studentId?: string;
  mfaVerified: boolean;
}): Actor {
  return {
    id: input.userId,
    roles: input.roles.filter(isRole),
    schoolIds: input.schoolIds,
    ...(input.studentId ? { studentId: input.studentId } : {}),
    mfa: input.mfaVerified,
  };
}
export function effectiveSelfService(
  grade: number | undefined,
  minimum = 10,
  override?: "SCHOOL_MANAGED" | "STUDENT_MANAGED" | "HYBRID",
) {
  return (
    override ??
    (grade !== undefined && grade >= minimum
      ? "STUDENT_MANAGED"
      : "SCHOOL_MANAGED")
  );
}
