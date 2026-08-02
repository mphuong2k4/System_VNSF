import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@vnsf/ui";
import { useTranslation } from "react-i18next";
import { api, HttpError } from "../../lib/api";

type Transfer = {
  id: string;
  student_id: string;
  period_id: string;
  transfer_type: string;
  amount: string;
  currency: string;
  transferred_at: string;
  reference: string;
  status: string;
  version: number;
};
const key = () => crypto.randomUUID();
export function TransfersPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Transfer[]>([]);
  const [error, setError] = useState<string>();
  const load = async () => {
    try {
      setItems((await api<{ items: Transfer[] }>("/manual-transfers")).items);
    } catch (cause) {
      setError(cause instanceof HttpError ? cause.body.code : "INTERNAL_ERROR");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api("/manual-transfers", {
        method: "POST",
        headers: { "idempotency-key": key() },
        body: JSON.stringify({
          student_id: v(data, "student_id"),
          period_id: v(data, "period_id"),
          transfer_type: v(data, "transfer_type"),
          amount: v(data, "amount"),
          currency: v(data, "currency"),
          transferred_at: new Date(v(data, "transferred_at")).toISOString(),
          reference: v(data, "reference"),
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof HttpError ? cause.body.code : "INTERNAL_ERROR");
    }
  }
  async function confirm(id: string, result: "RECEIVED" | "NOT_RECEIVED") {
    try {
      await api(`/manual-transfers/${id}/confirm`, {
        method: "POST",
        headers: { "idempotency-key": key() },
        body: JSON.stringify({ result }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof HttpError ? cause.body.code : "INTERNAL_ERROR");
    }
  }
  async function correct(event: FormEvent<HTMLFormElement>, item: Transfer) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api(`/manual-transfers/${item.id}/corrections`, {
        method: "POST",
        headers: { "idempotency-key": key(), "if-match": String(item.version) },
        body: JSON.stringify({
          transfer_type: v(data, "transfer_type"),
          amount: v(data, "amount"),
          currency: v(data, "currency"),
          transferred_at: new Date(v(data, "transferred_at")).toISOString(),
          reference: v(data, "reference"),
          reason_code: v(data, "reason_code"),
          reason: v(data, "reason"),
        }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof HttpError ? cause.body.code : "INTERNAL_ERROR");
    }
  }
  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t("transfer.title")}</Typography>
      {error && <Alert severity="error">{t(`errors.${error}`)}</Alert>}
      <Paper sx={{ p: 2 }}>
        <form onSubmit={(e) => void create(e)}>
          <Stack spacing={1}>
            {[
              "student_id",
              "period_id",
              "transfer_type",
              "amount",
              "transferred_at",
              "reference",
            ].map((name) => (
              <TextField
                key={name}
                name={name}
                type={name === "transferred_at" ? "datetime-local" : "text"}
                label={t(`transfer.${name}`)}
                required
              />
            ))}
            <TextField name="currency" select SelectProps={{ native: true }}>
              <option>VND</option>
              <option>USD</option>
            </TextField>
            <Button type="submit" variant="contained">
              {t("transfer.create")}
            </Button>
          </Stack>
        </form>
      </Paper>
      {items.map((item) => (
        <Paper key={item.id} sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Typography>
              {item.reference} | {item.amount} {item.currency} | {item.status} |
              v{item.version}
            </Typography>
            {item.status === "AWAITING_CONFIRMATION" && (
              <Stack direction="row">
                <Button onClick={() => void confirm(item.id, "RECEIVED")}>
                  {t("transfer.received")}
                </Button>
                <Button onClick={() => void confirm(item.id, "NOT_RECEIVED")}>
                  {t("transfer.notReceived")}
                </Button>
              </Stack>
            )}{" "}
            {!["CORRECTED", "CLOSED"].includes(item.status) && (
              <form onSubmit={(e) => void correct(e, item)}>
                <Stack spacing={1}>
                  {[
                    "transfer_type",
                    "amount",
                    "transferred_at",
                    "reference",
                    "reason_code",
                    "reason",
                  ].map((name) => (
                    <TextField
                      key={name}
                      name={name}
                      type={
                        name === "transferred_at" ? "datetime-local" : "text"
                      }
                      label={t(`transfer.${name}`)}
                      required
                    />
                  ))}
                  <TextField
                    name="currency"
                    select
                    SelectProps={{ native: true }}
                  >
                    <option>VND</option>
                    <option>USD</option>
                  </TextField>
                  <Button type="submit">{t("transfer.correct")}</Button>
                </Stack>
              </form>
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
function v(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
