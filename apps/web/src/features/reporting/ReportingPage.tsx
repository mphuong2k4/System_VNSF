import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@vnsf/ui";
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

export function ReportingPage({ manager = false }: { manager?: boolean }) {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [summary, setSummary] = useState<Summary[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [rows, setRows] = useState("[]");
  const [error, setError] = useState("");
  const message = (caught: unknown, fallback = "errors.INTERNAL_ERROR") =>
    caught instanceof HttpError ? caught.body.message_key : fallback;
  const load = async () => {
    try {
      const [metrics, report, dataJobs] = await Promise.all([
        api<Dashboard>("/dashboard"),
        manager
          ? api<Summary[]>("/reports/scholarship-summary").catch(() => [])
          : Promise.resolve([]),
        manager
          ? api<Job[]>("/data-jobs").catch(() => [])
          : Promise.resolve([]),
      ]);
      setDashboard(metrics);
      setSummary(report);
      setJobs(dataJobs);
      setError("");
    } catch (caught) {
      setError(message(caught));
    }
  };
  useEffect(() => {
    void load();
  }, [manager]);
  const startExport = async (resource_type: string) => {
    try {
      await api("/exports", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ resource_type }),
      });
      await load();
    } catch (caught) {
      setError(message(caught));
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
      setError(message(caught, "errors.INVALID_IMPORT_JSON"));
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
      setError(message(caught));
    }
  };
  return (
    <Stack spacing={4}>
      <Box>
        <Typography
          variant="overline"
          color="primary.main"
          sx={{ letterSpacing: ".12em", fontWeight: 800 }}
        >
          VNSF Analytics
        </Typography>
        <Typography variant="h3" sx={{ mt: 0.5 }}>
          {t("reporting.title")}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {t("notice")}
        </Typography>
      </Box>
      {error && <Alert severity="error">{t(error)}</Alert>}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 2,
        }}
      >
        {Object.entries(dashboard).map(([key, value]) => (
          <Paper
            key={key}
            sx={{ p: 2.5, position: "relative", overflow: "hidden" }}
          >
            <Box
              sx={{
                position: "absolute",
                inset: "0 auto 0 0",
                width: 4,
                bgcolor: key.includes("pending")
                  ? "warning.main"
                  : "primary.main",
              }}
            />
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ minHeight: 40 }}
            >
              {t(`reporting.metrics.${key}`)}
            </Typography>
            <Typography variant="h3" sx={{ mt: 1, fontSize: 34 }}>
              {value.toLocaleString()}
            </Typography>
          </Paper>
        ))}
      </Box>
      {manager && (
        <Paper sx={{ overflow: "hidden" }}>
          <Box
            sx={{
              px: 3,
              py: 2.5,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="h5">{t("reporting.summary")}</Typography>
          </Box>
          <TableContainer>
            <Table aria-label={t("reporting.summary")}>
              <TableHead>
                <TableRow>
                  <TableCell>{t("reporting.summary")}</TableCell>
                  <TableCell align="right">{t("reporting.students")}</TableCell>
                  <TableCell align="right">{t("reporting.approved")}</TableCell>
                  <TableCell align="right">{t("reporting.pending")}</TableCell>
                  <TableCell align="right">VND</TableCell>
                  <TableCell align="right">USD</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summary.map((row) => (
                  <TableRow key={row.school_id} hover>
                    <TableCell>
                      <Typography fontWeight={750}>
                        {row.school_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.school_code}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{row.students}</TableCell>
                    <TableCell align="right">
                      {row.approved_submissions}
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        size="small"
                        color={row.pending_submissions ? "warning" : "success"}
                        label={row.pending_submissions}
                      />
                    </TableCell>
                    <TableCell align="right">{row.transferred_vnd}</TableCell>
                    <TableCell align="right">{row.transferred_usd}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
      {manager && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
            gap: 3,
          }}
        >
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5">{t("reporting.exports")}</Typography>
            <Typography
              color="text.secondary"
              variant="body2"
              sx={{ mt: 1, mb: 2.5 }}
            >
              {t("notice")}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {["STUDENTS", "SUBMISSIONS", "TRANSFERS"].map((type) => (
                <Button
                  variant="outlined"
                  key={type}
                  onClick={() => void startExport(type)}
                >
                  {t("reporting.export")} {type}
                </Button>
              ))}
            </Stack>
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5">
              {t("reporting.importStudents")}
            </Typography>
            <TextField
              sx={{ mt: 2 }}
              fullWidth
              multiline
              minRows={4}
              value={rows}
              onChange={(event) => setRows(event.target.value)}
              label={t("reporting.rowsJson")}
            />
            <Button
              variant="contained"
              sx={{ mt: 2 }}
              onClick={() => void startImport()}
            >
              {t("reporting.validate")}
            </Button>
          </Paper>
        </Box>
      )}
      {manager && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Typography variant="h5">{t("reporting.jobs")}</Typography>
          <Button variant="outlined" onClick={() => void load()}>
            {t("reporting.refresh")}
          </Button>
        </Stack>
      )}
      {manager && (
        <Stack spacing={1.5}>
          {jobs.map((job) => (
            <Paper
              key={job.id}
              sx={{
                p: 2.5,
                display: { sm: "flex" },
                alignItems: "center",
                gap: 2,
              }}
            >
              <Box sx={{ flexGrow: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography fontWeight={800}>{job.resource_type}</Typography>
                  <Chip
                    size="small"
                    label={job.status}
                    color={
                      job.status === "FAILED"
                        ? "error"
                        : job.status === "COMPLETED"
                          ? "success"
                          : "default"
                    }
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {job.kind} · {job.id}
                </Typography>
              </Box>
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
      )}
    </Stack>
  );
}
