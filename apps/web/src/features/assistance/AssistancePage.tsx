import { useState, type FormEvent } from "react";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@vnsf/ui";
import { useTranslation } from "react-i18next";
import { api, HttpError } from "../../lib/api";
type Expense = {
  id: string;
  academic_year: string;
  status: string;
  version: number;
  vnd_per_term: string | null;
  vnd_per_year: string | null;
  usd_amount: string | null;
  liability: string | null;
  tutoring_money: string | null;
  notes: string | null;
};
type Support = {
  id: string;
  program_code: string;
  received: boolean;
  received_date: string | null;
  support_value: string | null;
  currency: string;
  status: string;
  notes: string | null;
  version: number;
};
const key = () => crypto.randomUUID();
export function AssistancePage() {
  const { t } = useTranslation();
  const [studentId, setStudentId] = useState("");
  const [year, setYear] = useState("");
  const [expense, setExpense] = useState<Expense>();
  const [supports, setSupports] = useState<Support[]>([]);
  const [error, setError] = useState<string>();
  const fail = (e: unknown) =>
    setError(e instanceof HttpError ? e.body.code : "INTERNAL_ERROR");
  async function load(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    try {
      setExpense(
        await api(`/students/${studentId}/education-expenses/${year}`),
      );
    } catch (cause) {
      if (cause instanceof HttpError && cause.status === 404)
        setExpense(undefined);
      else fail(cause);
    }
    try {
      setSupports(await api(`/students/${studentId}/support-programs`));
    } catch (cause) {
      fail(cause);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    try {
      setExpense(
        await api(`/students/${studentId}/education-expenses/${year}`, {
          method: "PUT",
          headers: { "if-match": String(expense?.version ?? 0) },
          body: JSON.stringify({
            vnd_per_term: nullable(d, "vnd_per_term"),
            vnd_per_year: nullable(d, "vnd_per_year"),
            usd_amount: nullable(d, "usd_amount"),
            liability: nullable(d, "liability"),
            tutoring_money: nullable(d, "tutoring_money"),
            notes: nullable(d, "notes"),
          }),
        }),
      );
    } catch (cause) {
      fail(cause);
    }
  }
  async function action(name: string, reason?: string) {
    if (!expense) return;
    try {
      setExpense(
        await api(`/students/${studentId}/education-expenses/${year}/${name}`, {
          method: "POST",
          headers: {
            "if-match": String(expense.version),
            "idempotency-key": key(),
          },
          body: JSON.stringify(reason ? { reason } : {}),
        }),
      );
    } catch (cause) {
      fail(cause);
    }
  }
  async function addSupport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    try {
      await api(`/students/${studentId}/support-programs`, {
        method: "POST",
        body: JSON.stringify(supportPayload(d)),
      });
      setSupports(await api(`/students/${studentId}/support-programs`));
      e.currentTarget.reset();
    } catch (cause) {
      fail(cause);
    }
  }
  async function updateSupport(
    e: FormEvent<HTMLFormElement>,
    support: Support,
  ) {
    e.preventDefault();
    try {
      await api(`/students/${studentId}/support-programs/${support.id}`, {
        method: "PUT",
        headers: { "if-match": String(support.version) },
        body: JSON.stringify(supportPayload(new FormData(e.currentTarget))),
      });
      setSupports(await api(`/students/${studentId}/support-programs`));
    } catch (cause) {
      fail(cause);
    }
  }
  async function archiveSupport(support: Support) {
    try {
      await api(`/students/${studentId}/support-programs/${support.id}`, {
        method: "DELETE",
        headers: { "if-match": String(support.version) },
      });
      setSupports(await api(`/students/${studentId}/support-programs`));
    } catch (cause) {
      fail(cause);
    }
  }
  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t("assistance.title")}</Typography>
      {error && <Alert severity="error">{t(`errors.${error}`)}</Alert>}
      <Paper sx={{ p: 2 }}>
        <form onSubmit={(e) => void load(e)}>
          <Stack direction="row" spacing={1}>
            <TextField
              label={t("assistance.studentId")}
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
            />
            <TextField
              label={t("assistance.year")}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2025-2026"
              required
            />
            <Button type="submit">{t("assistance.load")}</Button>
          </Stack>
        </form>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Typography>
          {t("assistance.expenses")}{" "}
          {expense &&
            `| ${expense.status} | v${expense.version} | ID ${expense.id}`}
        </Typography>
        <form onSubmit={(e) => void save(e)}>
          <Stack spacing={1}>
            {[
              "vnd_per_term",
              "vnd_per_year",
              "usd_amount",
              "liability",
              "tutoring_money",
            ].map((n) => (
              <TextField
                key={n}
                name={n}
                label={t(`assistance.${n}`)}
                inputProps={{ inputMode: "decimal" }}
              />
            ))}
            <TextField name="notes" label={t("assistance.notes")} multiline />
            <Button type="submit" disabled={!studentId || !year}>
              {t("assistance.save")}
            </Button>
          </Stack>
        </form>
        {expense && (
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {["submit", "return", "confirm", "correct"].map((a) => (
              <Button
                key={a}
                onClick={() =>
                  void action(
                    a,
                    a === "return" || a === "correct"
                      ? (window.prompt(t("assistance.reason")) ?? undefined)
                      : undefined,
                  )
                }
              >
                {t(`assistance.${a}`)}
              </Button>
            ))}
          </Stack>
        )}
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Typography>{t("assistance.supports")}</Typography>
        <form onSubmit={(e) => void addSupport(e)}>
          <Stack spacing={1}>
            <TextField
              name="program_code"
              select
              SelectProps={{ native: true }}
            >
              <option>TAP</option>
              <option>DESK</option>
              <option>READING_ROOM</option>
            </TextField>
            <TextField name="received" select SelectProps={{ native: true }}>
              <option value="false">{t("assistance.no")}</option>
              <option value="true">{t("assistance.yes")}</option>
            </TextField>
            <TextField name="received_date" type="date" />
            <TextField name="support_value" label={t("assistance.value")} />
            <TextField name="currency" select SelectProps={{ native: true }}>
              <option>VND</option>
              <option>USD</option>
            </TextField>
            <TextField name="status" select SelectProps={{ native: true }}>
              {["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </TextField>
            <TextField name="notes" label={t("assistance.notes")} />
            <Button type="submit" disabled={!studentId}>
              {t("assistance.addSupport")}
            </Button>
          </Stack>
        </form>
        {supports.map((s) => (
          <Paper key={s.id} variant="outlined" sx={{ p: 1, mt: 1 }}>
            <form onSubmit={(event) => void updateSupport(event, s)}>
              <Stack spacing={1}>
                <Typography>
                  {s.program_code} | v{s.version}
                </Typography>
                <input
                  type="hidden"
                  name="program_code"
                  value={s.program_code}
                />
                <TextField
                  name="received"
                  defaultValue={String(s.received)}
                  select
                  SelectProps={{ native: true }}
                >
                  <option value="false">{t("assistance.no")}</option>
                  <option value="true">{t("assistance.yes")}</option>
                </TextField>
                <TextField
                  name="received_date"
                  type="date"
                  defaultValue={s.received_date ?? ""}
                />
                <TextField
                  name="support_value"
                  label={t("assistance.value")}
                  defaultValue={s.support_value ?? ""}
                />
                <TextField
                  name="currency"
                  defaultValue={s.currency}
                  select
                  SelectProps={{ native: true }}
                >
                  <option>VND</option>
                  <option>USD</option>
                </TextField>
                <TextField
                  name="status"
                  defaultValue={s.status}
                  select
                  SelectProps={{ native: true }}
                >
                  {["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"].map(
                    (status) => (
                      <option key={status}>{status}</option>
                    ),
                  )}
                </TextField>
                <TextField
                  name="notes"
                  label={t("assistance.notes")}
                  defaultValue={s.notes ?? ""}
                />
                <Stack direction="row">
                  <Button type="submit">{t("assistance.updateSupport")}</Button>
                  <Button color="error" onClick={() => void archiveSupport(s)}>
                    {t("assistance.archiveSupport")}
                  </Button>
                </Stack>
              </Stack>
            </form>
          </Paper>
        ))}
      </Paper>
    </Stack>
  );
}
function value(d: FormData, k: string) {
  const v = d.get(k);
  return typeof v === "string" ? v : "";
}
function nullable(d: FormData, k: string) {
  const v = value(d, k).trim();
  return v || null;
}
function supportPayload(d: FormData) {
  return {
    program_code: value(d, "program_code"),
    received: value(d, "received") === "true",
    received_date: nullable(d, "received_date"),
    support_value: nullable(d, "support_value"),
    currency: value(d, "currency"),
    status: value(d, "status"),
    notes: nullable(d, "notes"),
  };
}
