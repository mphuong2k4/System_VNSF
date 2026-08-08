import { useEffect, useState } from "react";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@vnsf/ui";
import { useTranslation } from "react-i18next";
import { api, HttpError } from "../../lib/api";

type RecordRow = Record<string, unknown> & {
  id: string;
  status?: string;
  released_at?: string | null;
};
export function GovernancePage() {
  const { t } = useTranslation();
  const [audit, setAudit] = useState<RecordRow[]>([]);
  const [policies, setPolicies] = useState<RecordRow[]>([]);
  const [runs, setRuns] = useState<RecordRow[]>([]);
  const [holds, setHolds] = useState<RecordRow[]>([]);
  const [consents, setConsents] = useState<RecordRow[]>([]);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("AUDIT_EVENTS");
  const [days, setDays] = useState("365");
  const [holdRef, setHoldRef] = useState("*");
  const [reason, setReason] = useState("");
  const [content, setContent] = useState("");
  const [studentId, setStudentId] = useState("");
  const [policyId, setPolicyId] = useState("");
  const load = async () => {
    try {
      const [a, p, r, h, c] = await Promise.all([
        api<{ items: RecordRow[] }>("/audit-events?limit=25").catch(() => ({
          items: [],
        })),
        api<RecordRow[]>("/retention/policies").catch(() => []),
        api<RecordRow[]>("/retention/dry-runs").catch(() => []),
        api<RecordRow[]>("/legal-holds").catch(() => []),
        api<RecordRow[]>("/consent-policies"),
      ]);
      setAudit(a.items);
      setPolicies(p);
      setRuns(r);
      setHolds(h);
      setConsents(c);
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
  const mutate = async (path: string, body: unknown, method = "POST") => {
    try {
      await api(path, { method, body: JSON.stringify(body) });
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
      <Typography variant="h4">{t("governance.title")}</Typography>
      {error && <Alert severity="error">{t(error)}</Alert>}
      <Typography variant="h5">{t("governance.audit")}</Typography>
      <Button onClick={() => void load()}>{t("governance.refresh")}</Button>
      {audit.map((row) => (
        <Paper key={row.id} sx={{ p: 2 }}>
          <Typography>
            {String(row.occurred_at)} · {String(row.action)} ·{" "}
            {String(row.result)}
          </Typography>
          <Typography component="pre" sx={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(row.after_redacted ?? {}, null, 2)}
          </Typography>
        </Paper>
      ))}
      <Typography variant="h5">{t("governance.retention")}</Typography>
      <Stack direction="row" spacing={1}>
        <TextField
          label={t("governance.category")}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <TextField
          label={t("governance.days")}
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
        <Button
          onClick={() =>
            void mutate("/retention/policies", {
              data_category: category,
              retain_for_days: Number(days),
              action: "ANONYMIZE",
              effective_from: new Date().toISOString(),
            })
          }
        >
          {t("governance.createPolicy")}
        </Button>
      </Stack>
      {policies.map((row) => (
        <Paper key={row.id} sx={{ p: 2 }}>
          <Typography>
            {String(row.data_category)} · v{String(row.version)} ·{" "}
            {String(row.retain_for_days)} {t("governance.days")}
          </Typography>
          <Button
            onClick={() =>
              void mutate("/retention/dry-runs", { policy_id: row.id })
            }
          >
            {t("governance.dryRun")}
          </Button>
        </Paper>
      ))}
      {runs.map((row) => (
        <Paper key={row.id} sx={{ p: 2 }}>
          <Typography>
            {String(row.data_category)} · {String(row.status)} · candidates{" "}
            {String(row.candidate_count)} · held {String(row.held_count)}
          </Typography>
          {row.status === "DRAFT" && (
            <Button
              disabled={reason.length < 10}
              onClick={() =>
                void mutate(`/retention/dry-runs/${row.id}/approve`, { reason })
              }
            >
              {t("governance.approveEvidence")}
            </Button>
          )}
        </Paper>
      ))}
      <Typography variant="h5">{t("governance.holds")}</Typography>
      <TextField
        label={t("governance.reference")}
        value={holdRef}
        onChange={(e) => setHoldRef(e.target.value)}
      />
      <TextField
        label={t("governance.reason")}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button
        disabled={reason.length < 10}
        onClick={() =>
          void mutate("/legal-holds", {
            subject_type: category,
            subject_ref: holdRef,
            reason,
          })
        }
      >
        {t("governance.createHold")}
      </Button>
      {holds.map((row) => (
        <Paper key={row.id} sx={{ p: 2 }}>
          <Typography>
            {String(row.subject_type)} · {String(row.subject_ref)} ·{" "}
            {String(row.reason)}
          </Typography>
          {!row.released_at && (
            <Button
              disabled={reason.length < 10}
              onClick={() =>
                void mutate(
                  `/legal-holds/${row.id}/release`,
                  { reason },
                  "PATCH",
                )
              }
            >
              {t("governance.release")}
            </Button>
          )}
        </Paper>
      ))}
      <Typography variant="h5">{t("governance.consents")}</Typography>
      <TextField
        multiline
        minRows={3}
        label={t("governance.content")}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <Button
        disabled={content.length < 20}
        onClick={() =>
          void mutate("/consent-policies", {
            policy_type: "GENERAL_CONSENT",
            locale: "vi-VN",
            content,
          })
        }
      >
        {t("governance.publish")}
      </Button>
      {consents.map((row) => (
        <Paper key={row.id} sx={{ p: 2 }}>
          <Typography>
            {String(row.policy_type)} · v{String(row.version)} ·{" "}
            {String(row.locale)}
          </Typography>
          <Typography>{String(row.content)}</Typography>
        </Paper>
      ))}
      <TextField
        label={t("governance.studentId")}
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
      />
      <TextField
        label={t("governance.policyId")}
        value={policyId}
        onChange={(e) => setPolicyId(e.target.value)}
      />
      <Stack direction="row" spacing={1}>
        <Button
          onClick={() =>
            void mutate(`/students/${studentId}/consents/${policyId}`, {
              evidence: { channel: "WEB" },
            })
          }
        >
          {t("governance.accept")}
        </Button>
        <Button
          onClick={() =>
            void mutate(
              `/students/${studentId}/consents/${policyId}/withdraw`,
              { reason: reason || "User withdrawal" },
              "PATCH",
            )
          }
        >
          {t("governance.withdraw")}
        </Button>
      </Stack>
    </Stack>
  );
}
