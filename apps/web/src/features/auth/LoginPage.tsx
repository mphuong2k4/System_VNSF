import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Link } from "react-router";
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
type Form = z.infer<typeof schema>;
export function LoginPage() {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });
  const submit = handleSubmit(async (value) => {
    setServerError(undefined);
    try {
      const result = await api<{ mfa_required: boolean }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(value),
      });
      location.assign(result.mfa_required ? "/mfa" : "/");
    } catch (error) {
      setServerError(
        error instanceof HttpError
          ? t(error.body.message_key)
          : t("errors.INTERNAL_ERROR"),
      );
    }
  });
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        bgcolor: "grey.50",
        p: 2,
      }}
    >
      <Paper component="main" sx={{ width: "100%", maxWidth: 420, p: 4 }}>
        <Stack
          component="form"
          spacing={3}
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <Typography variant="h4">{t("auth.login")}</Typography>
          {serverError && <Alert severity="error">{serverError}</Alert>}
          <TextField
            label={t("auth.email")}
            autoComplete="username"
            error={!!errors.email}
            helperText={errors.email && t("errors.VALIDATION_EMAIL")}
            {...register("email")}
          />
          <TextField
            label={t("auth.password")}
            type="password"
            autoComplete="current-password"
            error={!!errors.password}
            helperText={errors.password && t("errors.VALIDATION_PASSWORD")}
            {...register("password")}
          />
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? t("common.loading") : t("auth.login")}
          </Button>
          <Link to="/forgot-password">{t("auth.forgot")}</Link>
        </Stack>
      </Paper>
    </Box>
  );
}
