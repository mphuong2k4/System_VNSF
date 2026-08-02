import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { DomainError } from "../../platform/error.filter.js";
import { can, toActor } from "../authorization/policy.js";
import type { AuthContext } from "../identity/session.guard.js";

const schoolSchema = z
  .object({
    code: z.string().min(2).max(30),
    name: z.string().min(2).max(150),
    active: z.boolean().default(true),
  })
  .strict();
const programSchema = z
  .object({
    code: z.string().min(2).max(30),
    name: z.string().min(2).max(150),
    workflow_type: z.enum(["ONE_LEVEL", "TWO_LEVEL"]),
    self_service_mode: z
      .enum(["SCHOOL_MANAGED", "STUDENT_MANAGED", "HYBRID"])
      .nullable()
      .default(null),
    self_service_min_grade: z.number().int().min(1).max(12).default(10),
    active: z.boolean().default(true),
  })
  .strict();
const periodBaseSchema = z
  .object({
    program_id: z.string().uuid(),
    code: z.string().min(2).max(30),
    opens_at: z.string().datetime().nullable().default(null),
    due_at: z.string().datetime(),
    timezone: z.literal("Asia/Ho_Chi_Minh").default("Asia/Ho_Chi_Minh"),
    workflow_type: z.enum(["ONE_LEVEL", "TWO_LEVEL"]),
  })
  .strict();
const periodSchema = periodBaseSchema.refine(
  (value) =>
    !value.opens_at || new Date(value.due_at) > new Date(value.opens_at),
  "INVALID_PERIOD_WINDOW",
);
const calendarSchema = z
  .object({
    calendar_date: z.string().date(),
    day_type: z.enum(["HOLIDAY", "WORKING_DAY"]),
    name: z.string().min(2).max(150),
  })
  .strict();

type Kind = "schools" | "programs" | "periods" | "calendar";
const definitions = {
  schools: {
    table: "schools",
    columns: "id,code,name,active,version",
    schema: schoolSchema,
  },
  programs: {
    table: "programs",
    columns:
      "id,code,name,workflow_type,self_service_mode,self_service_min_grade,active,version",
    schema: programSchema,
  },
  periods: {
    table: "academic_periods",
    columns:
      "id,program_id,code,opens_at,due_at,timezone,workflow_type,version",
    schema: periodSchema,
  },
  calendar: {
    table: "calendar_days",
    columns: "id,calendar_date,day_type,name,version",
    schema: calendarSchema,
  },
} as const;
function parseUpdate(kind: Kind, input: unknown): Record<string, unknown> {
  if (kind === "schools") return schoolSchema.partial().parse(input);
  if (kind === "programs") return programSchema.partial().parse(input);
  if (kind === "periods") return periodBaseSchema.partial().parse(input);
  return calendarSchema.partial().parse(input);
}

@Injectable()
export class ConfigurationService {
  constructor(private readonly db: DatabaseService) {}
  private authorize(auth: AuthContext) {
    if (!can(toActor(auth), "configuration.manage", {}))
      throw new DomainError("RESOURCE_NOT_FOUND", 404);
  }
  async list(auth: AuthContext, kind: Kind) {
    this.authorize(auth);
    const definition = definitions[kind];
    const order = kind === "calendar" ? "calendar_date" : "code";
    return (
      await this.db.query(
        `SELECT ${definition.columns} FROM ${definition.table} ORDER BY ${order}`,
      )
    ).rows;
  }
  async create(auth: AuthContext, kind: Kind, input: unknown) {
    this.authorize(auth);
    const value = definitions[kind].schema.parse(input) as Record<
      string,
      unknown
    >;
    const keys = Object.keys(value);
    try {
      const result = await this.db.query(
        `INSERT INTO ${definitions[kind].table}(${keys.join(",")}) VALUES(${keys.map((_, index) => `$${index + 1}`).join(",")}) RETURNING ${definitions[kind].columns}`,
        Object.values(value),
      );
      return result.rows[0];
    } catch (error) {
      if (isConstraintViolation(error))
        throw new DomainError("CONFIGURATION_CONFLICT", 409);
      throw error;
    }
  }
  async update(
    auth: AuthContext,
    kind: Kind,
    id: string,
    etag: string | undefined,
    input: unknown,
  ) {
    this.authorize(auth);
    if (!etag) throw new DomainError("PRECONDITION_REQUIRED", 428);
    const version = Number(etag.replaceAll('"', ""));
    if (!Number.isInteger(version))
      throw new DomainError("PRECONDITION_INVALID", 400);
    const value = parseUpdate(kind, input);
    const keys = Object.keys(value);
    if (!keys.length) throw new DomainError("VALIDATION_FAILED", 422);
    const assignments = keys
      .map((key, index) => `${key}=$${index + 3}`)
      .join(",");
    let result;
    try {
      result = await this.db.query(
        `UPDATE ${definitions[kind].table} SET ${assignments},version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING ${definitions[kind].columns}`,
        [id, version, ...Object.values(value)],
      );
    } catch (error) {
      if (isConstraintViolation(error))
        throw new DomainError("CONFIGURATION_CONFLICT", 409);
      throw error;
    }
    if (!result.rows[0]) {
      const exists = await this.db.query(
        `SELECT 1 FROM ${definitions[kind].table} WHERE id=$1`,
        [id],
      );
      throw new DomainError(
        exists.rowCount ? "VERSION_CONFLICT" : "RESOURCE_NOT_FOUND",
        exists.rowCount ? 412 : 404,
      );
    }
    return result.rows[0];
  }
}
function isConstraintViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["23505", "23503", "23514"].includes(
      String((error as { code: unknown }).code),
    )
  );
}
