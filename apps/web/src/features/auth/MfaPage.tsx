import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@vnsf/ui";
import { useTranslation } from "react-i18next";
import { api, HttpError } from "../../lib/api";
type Form = { code: string };
export function MfaPage() {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Form>();
  const submit = handleSubmit(async (value) => {
    try {
      await api("/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify(value),
      });
      const requested = new URLSearchParams(location.search).get("returnTo");
      const stored = sessionStorage.getItem("vnsf_return_to");
      const candidate = requested ?? stored;
      const returnTo =
        candidate?.startsWith("/") && !candidate.startsWith("//")
          ? candidate
          : "/";
      sessionStorage.removeItem("vnsf_return_to");
      location.assign(returnTo);
    } catch (error) {
      setMessage(
        error instanceof HttpError
          ? t(error.body.message_key)
          : t("errors.INTERNAL_ERROR"),
      );
    }
  });
  return (
    <Box
      sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}
    >
      <Paper sx={{ maxWidth: 420, p: 4 }}>
        <Stack
          component="form"
          spacing={3}
          onSubmit={(event) => void submit(event)}
        >
          <Typography variant="h4">{t("auth.mfa")}</Typography>
          {message && <Alert severity="error">{message}</Alert>}
          <TextField
            label={t("auth.code")}
            inputProps={{
              inputMode: "numeric",
              pattern: "[0-9]*",
              maxLength: 6,
            }}
            autoComplete="one-time-code"
            {...register("code", { required: true, pattern: /^\d{6}$/ })}
          />
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {t("auth.verify")}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
