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
import { api } from "../../lib/api";

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ email: string }>();
  const submit = handleSubmit(async ({ email }) => {
    await api("/auth/password/forgot", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setSent(true);
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
          <Typography variant="h4">{t("auth.forgot")}</Typography>
          {sent && <Alert severity="success">{t("auth.forgotSent")}</Alert>}
          <TextField
            type="email"
            label={t("auth.email")}
            required
            {...register("email", { required: true })}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || sent}
          >
            {t("auth.sendReset")}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
