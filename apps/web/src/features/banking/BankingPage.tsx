import { useState, type FormEvent } from "react";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@vnsf/ui";
import { useTranslation } from "react-i18next";
import { api, HttpError } from "../../lib/api";

type Account = {
  id: string;
  student_id: string;
  account_name_masked: string;
  account_number_masked: string;
  bank_code: string;
  status: string;
  rejection_reason?: string;
  version: number;
};

export function BankingPage() {
  const { t } = useTranslation();
  const [studentId, setStudentId] = useState("");
  const [account, setAccount] = useState<Account>();
  const [revealed, setRevealed] = useState<{
    account_name: string;
    account_number: string;
  }>();
  const [error, setError] = useState<string>();
  const fail = (cause: unknown) =>
    setError(cause instanceof HttpError ? cause.body.code : "INTERNAL_ERROR");
  async function load(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setRevealed(undefined);
    try {
      setAccount(await api<Account>(`/students/${studentId}/bank-account`));
    } catch (cause) {
      fail(cause);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setRevealed(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<Account>(`/students/${studentId}/bank-account`, {
        method: "PUT",
        headers: { "if-match": String(account?.version ?? 0) },
        body: JSON.stringify({
          account_name: value(data, "account_name"),
          account_number: value(data, "account_number"),
          bank_code: value(data, "bank_code"),
        }),
      });
      setAccount(result);
      event.currentTarget.reset();
    } catch (cause) {
      fail(cause);
    }
  }
  async function review(decision: "VALIDATED" | "REJECTED", reason?: string) {
    if (!account) return;
    try {
      setAccount(
        await api<Account>(`/students/${studentId}/bank-account/review`, {
          method: "PATCH",
          headers: { "if-match": String(account.version) },
          body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }),
        }),
      );
    } catch (cause) {
      fail(cause);
    }
  }
  async function reveal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api("/auth/reauthenticate", {
        method: "POST",
        body: JSON.stringify({ password: value(data, "password") }),
      });
      setRevealed(
        await api(`/students/${studentId}/bank-account/reveal`, {
          method: "PATCH",
          body: JSON.stringify({ purpose: value(data, "purpose") }),
        }),
      );
    } catch (cause) {
      fail(cause);
    }
  }
  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t("banking.title")}</Typography>
      {error && <Alert severity="error">{t(`errors.${error}`)}</Alert>}
      <Paper sx={{ p: 2 }}>
        <form onSubmit={(event) => void load(event)}>
          <Stack direction="row" spacing={1}>
            <TextField
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              label={t("banking.studentId")}
              required
              fullWidth
            />
            <Button type="submit">{t("banking.load")}</Button>
          </Stack>
        </form>
      </Paper>
      {account && (
        <Alert severity="info">
          {account.bank_code} · {account.account_name_masked} ·{" "}
          {account.account_number_masked} · {account.status} · v
          {account.version}
          {account.rejection_reason ? ` · ${account.rejection_reason}` : ""}
        </Alert>
      )}
      <Paper sx={{ p: 2 }}>
        <form onSubmit={(event) => void save(event)}>
          <Stack spacing={1}>
            <TextField
              name="account_name"
              label={t("banking.accountName")}
              required
            />
            <TextField
              name="account_number"
              label={t("banking.accountNumber")}
              inputProps={{ inputMode: "numeric", autoComplete: "off" }}
              required
            />
            <TextField
              name="bank_code"
              label={t("banking.bankCode")}
              required
            />
            <Button type="submit" variant="contained" disabled={!studentId}>
              {t("banking.save")}
            </Button>
          </Stack>
        </form>
      </Paper>
      {account?.status === "PENDING_REVIEW" && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Button onClick={() => void review("VALIDATED")}>
              {t("banking.validate")}
            </Button>
            <TextField id="bank-rejection-reason" label={t("banking.reason")} />
            <Button
              color="error"
              onClick={() =>
                void review(
                  "REJECTED",
                  (
                    document.getElementById(
                      "bank-rejection-reason",
                    ) as HTMLInputElement | null
                  )?.value,
                )
              }
            >
              {t("banking.reject")}
            </Button>
          </Stack>
        </Paper>
      )}
      {account && (
        <Paper sx={{ p: 2 }}>
          <form onSubmit={(event) => void reveal(event)}>
            <Stack spacing={1}>
              <Alert severity="warning">{t("banking.revealWarning")}</Alert>
              <TextField name="purpose" label={t("banking.purpose")} required />
              <TextField
                name="password"
                type="password"
                label={t("auth.password")}
                autoComplete="current-password"
                required
              />
              <Button type="submit">{t("banking.reveal")}</Button>
              {revealed && (
                <Typography>
                  {revealed.account_name} · {revealed.account_number}
                </Typography>
              )}
            </Stack>
          </form>
        </Paper>
      )}
    </Stack>
  );
}
function value(data: FormData, key: string) {
  const item = data.get(key);
  return typeof item === "string" ? item : "";
}
