import { useEffect, useState } from "react";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@vnsf/ui";
import { useTranslation } from "react-i18next";
import { api, HttpError } from "../../lib/api";

type Dashboard = Record<string, number>;
type Summary = {
  school_id: string;
  school_code: string;
  school_name: string;
  students: number;
  approved_submissions: number;
  pending_submissions: number;
  transferred_vnd: string;
  transferred_usd: string;
};
type Job = {
  id: string;
  kind: string;
  resource_type: string;
  status: string;
  result_summary: Record<string, unknown> | null;
  error_code: string | null;
  download_url?: string;
};

export function ReportingPage() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [summary, setSummary] = useState<Summary[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [rows, setRows] = useState("[]");
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const [metrics, report] = await Promise.all([
        api<Dashboard>("/dashboard"),
        api<Summary[]>("/reports/scholarship-summary").catch(() => []),
      ]);
      setDashboard(metrics);
      setSummary(report);
      setJobs(await api<Job[]>("/data-jobs").catch(() => []));
      setError("");
    } catch (caught) {
      setError(
        caught instanceof HttpError
          ? caught.body.message_key
          : "errors.INTERNAL_ERROR",
      );
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const startExport = async (resource_type: string) => {
    try {
      await api("/exports", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ resource_type }),
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof HttpError
          ? caught.body.message_key
          : "errors.INTERNAL_ERROR",
      );
    }
  };
  const startImport = async () => {
    try {
      const parsed: unknown = JSON.parse(rows);
      await api("/imports/students", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ rows: parsed }),
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof HttpError
          ? caught.body.message_key
          : "errors.INVALID_IMPORT_JSON",
      );
    }
  };
  const confirm = async (id: string) => {
    try {
      await api(`/imports/${id}/confirm`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
      });
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
      <Typography variant="h4">{t("reporting.title")}</Typography>
      {error && <Alert severity="error">{t(error)}</Alert>}
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
        {Object.entries(dashboard).map(([key, value]) => (
          <Paper key={key} sx={{ p: 2, minWidth: 160 }}>
            <Typography>{t(`reporting.metrics.${key}`)}</Typography>
            <Typography variant="h4">{value}</Typography>
          </Paper>
        ))}
      </Stack>
      <Typography variant="h5">{t("reporting.summary")}</Typography>
      {summary.map((row) => (
        <Paper key={row.school_id} sx={{ p: 2 }}>
          <Typography variant="h6">
            {row.school_code} · {row.school_name}
          </Typography>
          <Typography>
            {t("reporting.students")}: {row.students} ·{" "}
            {t("reporting.approved")}: {row.approved_submissions} ·{" "}
            {t("reporting.pending")}: {row.pending_submissions}
          </Typography>
          <Typography>
            VND: {row.transferred_vnd} · USD: {row.transferred_usd}
          </Typography>
        </Paper>
      ))}
      <Typography variant="h5">{t("reporting.exports")}</Typography>
      <Stack direction="row" spacing={1}>
        {["STUDENTS", "SUBMISSIONS", "TRANSFERS"].map((type) => (
          <Button key={type} onClick={() => void startExport(type)}>
            {t("reporting.export")} {type}
          </Button>
        ))}
      </Stack>
      <Typography variant="h5">{t("reporting.importStudents")}</Typography>
      <TextField
        multiline
        minRows={6}
        value={rows}
        onChange={(event) => setRows(event.target.value)}
        label={t("reporting.rowsJson")}
      />
      <Button onClick={() => void startImport()}>
        {t("reporting.validate")}
      </Button>
      <Typography variant="h5">{t("reporting.jobs")}</Typography>
      <Button onClick={() => void load()}>{t("reporting.refresh")}</Button>
      {jobs.map((job) => (
        <Paper key={job.id} sx={{ p: 2 }}>
          <Typography>
            {job.kind} · {job.resource_type} · {job.status}
          </Typography>
          <Typography component="pre" sx={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(job.result_summary ?? {}, null, 2)}
          </Typography>
          {job.status === "VALIDATED" && (
            <Button onClick={() => void confirm(job.id)}>
              {t("reporting.confirm")}
            </Button>
          )}
          {job.download_url && (
            <Button component="a" href={job.download_url}>
              {t("reporting.download")}
            </Button>
          )}
        </Paper>
      ))}
    </Stack>
  );
}
