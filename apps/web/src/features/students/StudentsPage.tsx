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

type Student = {
  id: string;
  student_code: string;
  full_name: string;
  date_of_birth: string;
  program_id: string;
  current_school_id: string;
  grade_level_current?: number;
  status: string;
  version: number;
};
type Guardian = {
  id: string;
  full_name: string;
  relationship: string;
  is_primary: boolean;
  phone_masked?: string;
  email_masked?: string;
};
type History = {
  id: string;
  school_code: string;
  school_name: string;
  effective_from: string;
  effective_to: string | null;
  change_reason: string;
};
type IdentityView = {
  configured: boolean;
  identity_masked?: string;
  version: number;
};

export function StudentsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [selected, setSelected] = useState<Student>();
  const [error, setError] = useState<string>();
  const query = useQuery({
    queryKey: ["students"],
    queryFn: () => api<{ items: Student[] }>("/students?size=100"),
  });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Student>("/students", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      setError(undefined);
      await client.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (cause) =>
      setError(cause instanceof HttpError ? cause.body.code : "INTERNAL_ERROR"),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    create.mutate({
      student_code: entry(data.student_code),
      full_name: entry(data.full_name),
      date_of_birth: entry(data.date_of_birth),
      program_id: entry(data.program_id),
      current_school_id: entry(data.current_school_id),
      grade_level_current: Number(entry(data.grade_level_current)),
      ...(entry(data.duplicate_override_reason)
        ? { duplicate_override_reason: entry(data.duplicate_override_reason) }
        : {}),
    });
  }
  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t("students")}</Typography>
      {error && <Alert severity="error">{t(`errors.${error}`)}</Alert>}
      <Paper sx={{ p: 2 }}>
        <form onSubmit={submit}>
          <Stack spacing={1}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
              {(
                [
                  "student_code",
                  "full_name",
                  "date_of_birth",
                  "program_id",
                  "current_school_id",
                  "grade_level_current",
                ] as const
              ).map((name) => (
                <TextField
                  key={name}
                  name={name}
                  label={t(`student.fields.${name}`)}
                  required
                  type={
                    name === "date_of_birth"
                      ? "date"
                      : name === "grade_level_current"
                        ? "number"
                        : "text"
                  }
                  InputLabelProps={
                    name === "date_of_birth" ? { shrink: true } : {}
                  }
                />
              ))}
            </Stack>
            <TextField
              name="duplicate_override_reason"
              label={t("student.fields.duplicate_override_reason")}
              helperText={t("student.duplicateOverrideHelp")}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={create.isPending}
            >
              {t("student.add")}
            </Button>
          </Stack>
        </form>
      </Paper>
      {query.isLoading && <Skeleton height={100} />}
      {query.isError && (
        <Alert severity="error">{t("errors.INTERNAL_ERROR")}</Alert>
      )}
      {query.data?.items.map((student) => (
        <Paper variant="outlined" sx={{ p: 2 }} key={student.id}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography>
              {student.student_code} · {student.full_name} · {student.status}
            </Typography>
            <Button onClick={() => setSelected(student)}>
              {t("student.details")}
            </Button>
          </Stack>
        </Paper>
      ))}
      {selected && <StudentDetails student={selected} />}
    </Stack>
  );
}
function StudentDetails({ student }: { student: Student }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [revealedIdentity, setRevealedIdentity] = useState("");
  const guardians = useQuery({
    queryKey: ["students", student.id, "guardians"],
    queryFn: () => api<Guardian[]>(`/students/${student.id}/guardians`),
  });
  const history = useQuery({
    queryKey: ["students", student.id, "history"],
    queryFn: () => api<History[]>(`/students/${student.id}/school-history`),
  });
  const identity = useQuery({
    queryKey: ["students", student.id, "identity"],
    queryFn: () => api<IdentityView>(`/students/${student.id}/identity`),
  });
  const updateIdentity = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/students/${student.id}/identity`, {
        method: "PATCH",
        headers: { "if-match": String(identity.data?.version ?? 0) },
        body: JSON.stringify(body),
      }),
    onSuccess: async () =>
      client.invalidateQueries({
        queryKey: ["students", student.id, "identity"],
      }),
  });
  const revealIdentity = useMutation({
    mutationFn: (reason: string) =>
      api<{ identity_number: string }>(
        `/students/${student.id}/identity/reveal`,
        { method: "POST", body: JSON.stringify({ reason }) },
      ),
    onSuccess: (result) => {
      setRevealedIdentity(result.identity_number);
      window.setTimeout(() => setRevealedIdentity(""), 60_000);
    },
  });
  const addGuardian = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/students/${student.id}/guardians`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () =>
      client.invalidateQueries({
        queryKey: ["students", student.id, "guardians"],
      }),
  });
  const transfer = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/students/${student.id}/school-transfer`, {
        method: "POST",
        headers: { "if-match": `"${student.version}"` },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["students"] });
      await client.invalidateQueries({
        queryKey: ["students", student.id, "history"],
      });
    },
  });
  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h5">{student.full_name}</Typography>
        {(addGuardian.isError ||
          transfer.isError ||
          updateIdentity.isError ||
          revealIdentity.isError) && (
          <Alert severity="error">{t("errors.INTERNAL_ERROR")}</Alert>
        )}
        <Typography variant="h6">{t("student.identity")}</Typography>
        <Typography>
          {revealedIdentity ||
            identity.data?.identity_masked ||
            t("student.identityMissing")}
        </Typography>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(event.currentTarget));
            updateIdentity.mutate({
              identity_number: entry(data.identity_number),
              reason: entry(data.identity_reason),
            });
            event.currentTarget.reset();
          }}
        >
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              name="identity_number"
              label={t("student.identityNumber")}
              inputProps={{ inputMode: "numeric", pattern: "[0-9]{9,12}" }}
              required
            />
            <TextField
              name="identity_reason"
              label={t("student.identityReason")}
              required
            />
            <Button type="submit" disabled={updateIdentity.isPending}>
              {t("student.identitySave")}
            </Button>
          </Stack>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(event.currentTarget));
            revealIdentity.mutate(entry(data.reveal_reason));
            event.currentTarget.reset();
          }}
        >
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              name="reveal_reason"
              label={t("student.revealReason")}
              required
            />
            <Button type="submit" disabled={revealIdentity.isPending}>
              {t("student.identityReveal")}
            </Button>
          </Stack>
        </form>
        <Typography variant="h6">{t("student.guardians")}</Typography>
        {guardians.isLoading && <Skeleton height={50} />}
        {guardians.data?.map((guardian) => (
          <Typography key={guardian.id}>
            {guardian.full_name} · {guardian.relationship} ·{" "}
            {guardian.phone_masked ?? guardian.email_masked}
          </Typography>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(event.currentTarget));
            addGuardian.mutate({
              full_name: entry(data.full_name),
              relationship: entry(data.relationship),
              phone: entry(data.phone),
              is_primary: data.is_primary === "on",
            });
            event.currentTarget.reset();
          }}
        >
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              name="full_name"
              label={t("student.guardianName")}
              required
            />
            <TextField
              name="relationship"
              label={t("student.relationship")}
              required
              select
              SelectProps={{ native: true }}
            >
              {["MOTHER", "FATHER", "GUARDIAN", "OTHER"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </TextField>
            <TextField name="phone" label={t("student.phone")} required />
            <label>
              <input name="is_primary" type="checkbox" /> {t("student.primary")}
            </label>
            <Button type="submit" disabled={addGuardian.isPending}>
              {t("student.addGuardian")}
            </Button>
          </Stack>
        </form>
        <Typography variant="h6">{t("student.schoolHistory")}</Typography>
        {history.isLoading && <Skeleton height={50} />}
        {history.data?.map((item) => (
          <Typography key={item.id}>
            {item.school_code} · {item.school_name} · {item.effective_from} –{" "}
            {item.effective_to ?? t("student.current")}
          </Typography>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(event.currentTarget));
            transfer.mutate({
              target_school_id: entry(data.target_school_id),
              effective_from: entry(data.effective_from),
              reason: entry(data.reason),
            });
          }}
        >
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              name="target_school_id"
              label={t("student.targetSchool")}
              required
            />
            <TextField
              name="effective_from"
              type="date"
              label={t("student.effectiveFrom")}
              required
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              name="reason"
              label={t("student.transferReason")}
              required
            />
            <Button type="submit" disabled={transfer.isPending}>
              {t("student.transfer")}
            </Button>
          </Stack>
        </form>
      </Stack>
    </Paper>
  );
}
function entry(value: FormDataEntryValue | undefined) {
  return typeof value === "string" ? value : "";
}
