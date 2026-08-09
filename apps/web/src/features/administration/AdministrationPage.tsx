import { useEffect, useState } from "react";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@vnsf/ui";
import { useTranslation } from "react-i18next";
import { api, HttpError } from "../../lib/api";

type UserRow = {
  id: string;
  email: string;
  status: string;
  preferred_locale: string;
  version: number;
  roles: string[];
  school_ids: string[];
};
type BreakGlassRow = {
  id: string;
  reason: string;
  expires_at: string;
  revoked_at?: string | null;
};

export function AdministrationPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sessions, setSessions] = useState<BreakGlassRow[]>([]);
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState("SCHOOL_MANAGER");
  const [schoolIds, setSchoolIds] = useState("");
  const [reason, setReason] = useState("");
  const [studentScope, setStudentScope] = useState("");
  const [error, setError] = useState("");
  const list = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const load = async () => {
    try {
      const [userRows, breakGlassRows] = await Promise.all([
        api<UserRow[]>("/administration/users"),
        api<BreakGlassRow[]>("/break-glass"),
      ]);
      setUsers(userRows);
      setSessions(breakGlassRows);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof HttpError
          ? caught.body.message_key
          : "errors.INTERNAL_ERROR",
      );
    }
  };
  useEffect(() => void load(), []);
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      await load();
    } catch (caught) {
      setError(
        caught instanceof HttpError
          ? caught.body.message_key
          : "errors.INTERNAL_ERROR",
      );
    }
  };
  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t("administration.title")}</Typography>
      {error && <Alert severity="error">{t(error)}</Alert>}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h5">{t("administration.createUser")}</Typography>
          <TextField
            label="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label={t("administration.roles")}
            value={roles}
            onChange={(event) => setRoles(event.target.value)}
          />
          <TextField
            label={t("administration.schoolIds")}
            value={schoolIds}
            onChange={(event) => setSchoolIds(event.target.value)}
          />
          <Button
            onClick={() =>
              void run(() =>
                api("/administration/users", {
                  method: "POST",
                  body: JSON.stringify({
                    email,
                    preferred_locale: "vi-VN",
                    roles: list(roles),
                    school_ids: list(schoolIds),
                  }),
                }),
              )
            }
          >
            {t("administration.createUser")}
          </Button>
        </Stack>
      </Paper>
      {users.map((user) => (
        <Paper key={user.id} sx={{ p: 2 }}>
          <Typography>
            {user.email} · {user.status} · v{user.version}
          </Typography>
          <Typography>
            {user.roles.join(", ")} · {user.school_ids.join(", ")}
          </Typography>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const value = (name: string) => {
                const item = data.get(name);
                return typeof item === "string" ? item : "";
              };
              void run(() =>
                api(`/administration/users/${user.id}`, {
                  method: "PATCH",
                  headers: { "if-match": String(user.version) },
                  body: JSON.stringify({
                    status: value("status"),
                    preferred_locale: value("preferred_locale"),
                    roles: list(value("roles")),
                    school_ids: list(value("school_ids")),
                    reason: value("reason"),
                  }),
                }),
              );
            }}
          >
            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
              <TextField name="status" defaultValue={user.status} required />
              <TextField
                name="preferred_locale"
                defaultValue={user.preferred_locale}
                required
              />
              <TextField
                name="roles"
                defaultValue={user.roles.join(",")}
                required
              />
              <TextField
                name="school_ids"
                defaultValue={user.school_ids.join(",")}
              />
              <TextField
                name="reason"
                label={t("administration.reason")}
                required
              />
              <Button type="submit">{t("administration.saveAccess")}</Button>
            </Stack>
          </form>
          <Button
            disabled={user.status === "SUSPENDED"}
            onClick={() =>
              void run(() =>
                api(`/administration/users/${user.id}`, {
                  method: "PATCH",
                  headers: { "if-match": String(user.version) },
                  body: JSON.stringify({
                    status: "SUSPENDED",
                    reason: "Administrative access suspension",
                  }),
                }),
              )
            }
          >
            {t("administration.suspend")}
          </Button>
        </Paper>
      ))}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h5">{t("administration.breakGlass")}</Typography>
          <TextField
            label={t("administration.reason")}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <TextField
            label={t("administration.studentScope")}
            value={studentScope}
            onChange={(event) => setStudentScope(event.target.value)}
          />
          <Button
            onClick={() =>
              void run(() =>
                api("/break-glass", {
                  method: "POST",
                  body: JSON.stringify({
                    reason,
                    duration_minutes: 30,
                    scope: { student_ids: list(studentScope), school_ids: [] },
                  }),
                }),
              )
            }
          >
            {t("administration.start")}
          </Button>
        </Stack>
      </Paper>
      {sessions.map((session) => (
        <Paper key={session.id} sx={{ p: 2 }}>
          <Typography>
            {session.reason} · {session.expires_at}
          </Typography>
          {!session.revoked_at && (
            <Button
              onClick={() =>
                void run(() =>
                  api(`/break-glass/${session.id}`, {
                    method: "DELETE",
                    body: JSON.stringify({
                      reason: "Emergency access completed",
                    }),
                  }),
                )
              }
            >
              {t("administration.end")}
            </Button>
          )}
        </Paper>
      ))}
    </Stack>
  );
}
