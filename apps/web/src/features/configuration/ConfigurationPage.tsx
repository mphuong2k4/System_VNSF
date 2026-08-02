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
import { api } from "../../lib/api";

type Kind = "schools" | "programs" | "periods" | "calendar";
type Row = Record<string, unknown> & { id: string; version: number };
const sections: Kind[] = ["schools", "programs", "periods", "calendar"];

export function ConfigurationPage() {
  const { t } = useTranslation();
  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t("configuration.title")}</Typography>
      {sections.map((kind) => (
        <ConfigurationSection key={kind} kind={kind} />
      ))}
    </Stack>
  );
}
function ConfigurationSection({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [error, setError] = useState(false);
  const query = useQuery({
    queryKey: ["configuration", kind],
    queryFn: () => api<Row[]>(`/configuration/${kind}`),
  });
  const mutation = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<Row>(`/configuration/${kind}`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setError(false);
      await client.invalidateQueries({ queryKey: ["configuration", kind] });
    },
    onError: () => setError(true),
  });
  const updateMutation = useMutation({
    mutationFn: ({
      row,
      changes,
    }: {
      row: Row;
      changes: Record<string, unknown>;
    }) =>
      api<Row>(`/configuration/${kind}/${row.id}`, {
        method: "PATCH",
        headers: { "if-match": `"${row.version}"` },
        body: JSON.stringify(changes),
      }),
    onSuccess: async () => {
      setError(false);
      await client.invalidateQueries({ queryKey: ["configuration", kind] });
    },
    onError: () => setError(true),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    mutation.mutate(payload(kind, data));
    event.currentTarget.reset();
  }
  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h5">{t(`configuration.${kind}`)}</Typography>
        {error && (
          <Alert severity="error">{t("errors.CONFIGURATION_CONFLICT")}</Alert>
        )}
        <form onSubmit={submit}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            {fields(kind).map((field) => (
              <TextField
                key={field.name}
                name={field.name}
                label={t(`configuration.fields.${field.name}`)}
                type={field.type ?? "text"}
                required={field.required ?? false}
                inputProps={field.inputProps ?? {}}
                select={!!field.options}
                SelectProps={{ native: !!field.options }}
              >
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </TextField>
            ))}
            <Button
              type="submit"
              variant="contained"
              disabled={mutation.isPending}
            >
              {t("configuration.add")}
            </Button>
          </Stack>
        </form>
        {query.isLoading && <Skeleton height={80} />}
        {query.isError && (
          <Alert severity="error">{t("errors.INTERNAL_ERROR")}</Alert>
        )}
        {!query.isLoading && !query.data?.length && (
          <Alert severity="info">{t("configuration.empty")}</Alert>
        )}
        {query.data?.map((row) => (
          <Paper variant="outlined" sx={{ p: 1 }} key={row.id}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              justifyContent="space-between"
              alignItems={{ md: "center" }}
              gap={1}
            >
              <Typography>{display(row)}</Typography>
              {(kind === "schools" || kind === "programs") && (
                <Button
                  variant="outlined"
                  onClick={() =>
                    updateMutation.mutate({
                      row,
                      changes: { active: !row.active },
                    })
                  }
                  disabled={updateMutation.isPending}
                >
                  {row.active
                    ? t("configuration.deactivate")
                    : t("configuration.activate")}
                </Button>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Paper>
  );
}
type Field = {
  name: string;
  type?: string;
  required?: boolean;
  inputProps?: Record<string, unknown>;
  options?: string[];
};
function fields(kind: Kind): Field[] {
  if (kind === "schools")
    return [
      { name: "code", required: true },
      { name: "name", required: true },
    ];
  if (kind === "programs")
    return [
      { name: "code", required: true },
      { name: "name", required: true },
      {
        name: "workflow_type",
        required: true,
        options: ["ONE_LEVEL", "TWO_LEVEL"],
      },
      {
        name: "self_service_mode",
        options: ["SCHOOL_MANAGED", "STUDENT_MANAGED", "HYBRID"],
      },
      {
        name: "self_service_min_grade",
        type: "number",
        required: true,
        inputProps: { min: 1, max: 12 },
      },
    ];
  if (kind === "periods")
    return [
      { name: "program_id", required: true },
      { name: "code", required: true },
      { name: "opens_at", type: "datetime-local" },
      { name: "due_at", type: "datetime-local", required: true },
      {
        name: "workflow_type",
        required: true,
        options: ["ONE_LEVEL", "TWO_LEVEL"],
      },
    ];
  return [
    { name: "calendar_date", type: "date", required: true },
    { name: "day_type", required: true, options: ["HOLIDAY", "WORKING_DAY"] },
    { name: "name", required: true },
  ];
}
function payload(kind: Kind, data: Record<string, FormDataEntryValue>) {
  const result: Record<string, unknown> = { ...data };
  if (kind === "schools") result.active = true;
  if (kind === "programs") {
    result.active = true;
    result.self_service_min_grade = Number(data.self_service_min_grade);
    result.self_service_mode = data.self_service_mode || null;
  }
  if (kind === "periods") {
    result.opens_at = entryString(data.opens_at)
      ? new Date(entryString(data.opens_at)).toISOString()
      : null;
    result.due_at = new Date(entryString(data.due_at)).toISOString();
    result.timezone = "Asia/Ho_Chi_Minh";
  }
  return result;
}
function display(row: Row) {
  return Object.entries(row)
    .filter(([key]) => !["id", "version"].includes(key))
    .map(([key, value]) => `${key}: ${displayValue(value)}`)
    .join(" · ");
}
function entryString(value: FormDataEntryValue | undefined) {
  return typeof value === "string" ? value : "";
}
function displayValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (["string", "number", "boolean"].includes(typeof value))
    return `${value as string | number | boolean}`;
  return JSON.stringify(value);
}
