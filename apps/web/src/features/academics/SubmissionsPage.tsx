import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@vnsf/ui";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, HttpError } from "../../lib/api";

type Submission = {
  id: string;
  student_id: string;
  student_code: string;
  full_name: string;
  period_id: string;
  period_code: string;
  type: string;
  status: string;
  version: number;
  current_version_no: number;
  workflow_type: string;
};
export function SubmissionsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [error, setError] = useState<string>();
  const query = useQuery({
    queryKey: ["submissions"],
    queryFn: () => api<Submission[]>("/submissions"),
  });
  const refresh = async () =>
    client.invalidateQueries({ queryKey: ["submissions"] });
  const mutation = useMutation({
    mutationFn: ({
      path,
      method,
      body,
      headers,
    }: {
      path: string;
      method: string;
      body: unknown;
      headers?: Record<string, string>;
    }) =>
      api(path, {
        method,
        ...(headers ? { headers } : {}),
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      setError(undefined);
      await refresh();
    },
    onError: (cause) =>
      setError(cause instanceof HttpError ? cause.body.code : "INTERNAL_ERROR"),
  });
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    mutation.mutate({
      path: "/submissions",
      method: "POST",
      body: {
        student_id: entry(data.student_id),
        period_id: entry(data.period_id),
        type: entry(data.type),
      },
    });
  }
  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t("submissions")}</Typography>
      {error && <Alert severity="error">{t(`errors.${error}`)}</Alert>}
      <Paper sx={{ p: 2 }}>
        <form onSubmit={create}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              name="student_id"
              label={t("academic.studentId")}
              required
            />
            <TextField
              name="period_id"
              label={t("academic.periodId")}
              required
            />
            <TextField name="type" label={t("academic.type")} required />
            <Button type="submit" variant="contained">
              {t("academic.create")}
            </Button>
          </Stack>
        </form>
      </Paper>
      {query.isLoading && <Skeleton height={100} />}
      {query.data?.map((submission) => (
        <SubmissionCard
          key={submission.id}
          submission={submission}
          mutate={mutation.mutate}
          pending={mutation.isPending}
        />
      ))}
    </Stack>
  );
}
function SubmissionCard({
  submission,
  mutate,
  pending,
}: {
  submission: Submission;
  mutate: (value: {
    path: string;
    method: string;
    body: unknown;
    headers?: Record<string, string>;
  }) => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const mutable = ["DRAFT", "RETURNED"].includes(submission.status);
  const reviewable = ["SCHOOL_REVIEW", "PROGRAM_REVIEW"].includes(
    submission.status,
  );
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <Typography variant="h6">
          {submission.student_code} · {submission.full_name}
        </Typography>
        <Typography>
          {submission.period_code} · {submission.type} · {submission.status} · v
          {submission.version}
        </Typography>
        {mutable && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              let payload: unknown;
              try {
                payload = JSON.parse(entry(data.payload));
              } catch {
                return;
              }
              mutate({
                path: `/submissions/${submission.id}/draft`,
                method: "PATCH",
                headers: { "if-match": `"${submission.version}"` },
                body: { payload },
              });
            }}
          >
            <Stack spacing={1}>
              <TextField
                name="payload"
                label={t("academic.payload")}
                multiline
                minRows={3}
                defaultValue="{}"
                required
              />
              <Stack direction="row" spacing={1}>
                <Button type="submit" disabled={pending}>
                  {t("academic.saveDraft")}
                </Button>
                <Button
                  disabled={pending}
                  onClick={() =>
                    mutate({
                      path: `/submissions/${submission.id}/submit`,
                      method: "POST",
                      headers: { "idempotency-key": crypto.randomUUID() },
                      body: { version: submission.version },
                    })
                  }
                >
                  {t("academic.submit")}
                </Button>
              </Stack>
            </Stack>
          </form>
        )}
        {reviewable && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              mutate({
                path: `/submissions/${submission.id}/review`,
                method: "POST",
                headers: { "if-match": `"${submission.version}"` },
                body: {
                  decision: entry(data.decision),
                  reason_code: entry(data.reason_code) || undefined,
                  note: entry(data.note) || undefined,
                },
              });
            }}
          >
            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
              <TextField
                name="decision"
                label={t("academic.decision")}
                select
                SelectProps={{ native: true }}
              >
                {["APPROVE", "RETURN", "REJECT"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </TextField>
              <TextField name="reason_code" label={t("academic.reasonCode")} />
              <TextField name="note" label={t("academic.note")} />
              <Button type="submit" disabled={pending}>
                {t("academic.review")}
              </Button>
            </Stack>
          </form>
        )}
      </Stack>
    </Paper>
  );
}
function entry(value: FormDataEntryValue | undefined) {
  return typeof value === "string" ? value : "";
}
