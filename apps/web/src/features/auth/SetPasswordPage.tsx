import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "react-router";
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

export function SetPasswordPage({ mode }: { mode: "activate" | "reset" }) {
  const { t } = useTranslation();
  const location = useLocation();
  const token = useMemo(
    () => new URLSearchParams(location.search).get("token") ?? "",
    [location.search],
  );
  const [result, setResult] = useState<"success" | "error">();
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<{ password: string; confirmation: string }>();
  const submit = handleSubmit(async ({ password }) => {
    try {
      await api(
        mode === "activate" ? "/auth/activate" : "/auth/password/reset",
        { method: "POST", body: JSON.stringify({ token, password }) },
      );
      setResult("success");
    } catch (error) {
      setResult("error");
      if (!(error instanceof HttpError)) throw error;
    }
  });
  return (
    <Box
      sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}
    >
      <Paper sx={{ width: "100%", maxWidth: 420, p: 4 }}>
        <Stack
          component="form"
          spacing={3}
          onSubmit={(event) => void submit(event)}
        >
          <Typography variant="h4">
            {t(mode === "activate" ? "auth.activate" : "auth.reset")}
          </Typography>
          {!token && (
            <Alert severity="error">
              {t("errors.TOKEN_INVALID_OR_EXPIRED")}
            </Alert>
          )}
          {result === "success" && (
            <Alert severity="success">{t("auth.passwordSet")}</Alert>
          )}
          {result === "error" && (
            <Alert severity="error">
              {t("errors.TOKEN_INVALID_OR_EXPIRED")}
            </Alert>
          )}
          <TextField
            type="password"
            label={t("auth.newPassword")}
            error={!!errors.password}
            {...register("password", { required: true, minLength: 12 })}
          />
          <TextField
            type="password"
            label={t("auth.confirmPassword")}
            error={!!errors.confirmation}
            {...register("confirmation", {
              required: true,
              validate: (value) => value === watch("password"),
            })}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || !token || result === "success"}
          >
            {t("auth.savePassword")}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
