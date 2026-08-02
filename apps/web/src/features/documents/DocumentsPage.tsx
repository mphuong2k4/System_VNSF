import { useState, type FormEvent } from "react";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@vnsf/ui";
import { useTranslation } from "react-i18next";
import { api, HttpError } from "../../lib/api";

type InitResponse = {
  id: string;
  upload_url: string;
  required_headers: Record<string, string>;
};
export function DocumentsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setStatus(t("documents.hashing"));
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    if (!(file instanceof File)) return;
    try {
      const checksum = [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        ),
      ]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const initiated = await api<InitResponse>("/documents/upload-init", {
        method: "POST",
        body: JSON.stringify({
          owner_type: entry(data.get("owner_type")),
          owner_id: entry(data.get("owner_id")),
          purpose: entry(data.get("purpose")),
          filename: file.name,
          size_bytes: file.size,
          mime_type: file.type,
          checksum_sha256: checksum,
        }),
      });
      setStatus(t("documents.uploading"));
      const response = await fetch(initiated.upload_url, {
        method: "PUT",
        headers: initiated.required_headers,
        body: file,
      });
      if (!response.ok) throw new Error("OBJECT_UPLOAD_FAILED");
      await api(`/documents/${initiated.id}/complete`, {
        method: "POST",
        body: "{}",
      });
      setStatus(`${t("documents.pendingScan")} ID: ${initiated.id}`);
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof HttpError ? cause.body.code : "INTERNAL_ERROR");
      setStatus(undefined);
    }
  }
  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ download_url: string }>(
        `/documents/${entry(data.get("document_id"))}/download`,
      );
      window.location.assign(result.download_url);
    } catch (cause) {
      setError(cause instanceof HttpError ? cause.body.code : "INTERNAL_ERROR");
    }
  }
  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t("documents.title")}</Typography>
      {error && <Alert severity="error">{t(`errors.${error}`)}</Alert>}
      {status && <Alert severity="info">{status}</Alert>}
      <Paper sx={{ p: 2 }}>
        <form onSubmit={(event) => void upload(event)}>
          <Stack spacing={1}>
            <TextField
              name="owner_type"
              label={t("documents.ownerType")}
              select
              SelectProps={{ native: true }}
            >
              {["STUDENT", "SUBMISSION", "EDUCATION_EXPENSE"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </TextField>
            <TextField
              name="owner_id"
              label={t("documents.ownerId")}
              required
            />
            <TextField name="purpose" label={t("documents.purpose")} required />
            <input
              name="file"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
            />
            <Button type="submit" variant="contained">
              {t("documents.upload")}
            </Button>
          </Stack>
        </form>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <form onSubmit={(event) => void download(event)}>
          <Stack direction="row" spacing={1}>
            <TextField
              name="document_id"
              label={t("documents.documentId")}
              required
            />
            <Button type="submit">{t("documents.download")}</Button>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
}
function entry(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}
