import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Avatar,
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
      const requested = new URLSearchParams(location.search).get("returnTo");
      const returnTo =
        requested?.startsWith("/") && !requested.startsWith("//")
          ? requested
          : "/";
      if (result.mfa_required) {
        sessionStorage.setItem("vnsf_return_to", returnTo);
        location.assign(`/mfa?returnTo=${encodeURIComponent(returnTo)}`);
      } else {
        location.assign(returnTo);
      }
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
        gridTemplateColumns: { xs: "1fr", md: "minmax(360px, .9fr) 1.1fr" },
        bgcolor: "background.default",
      }}
    >
      <Box
        component="aside"
        sx={{
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "space-between",
          p: { md: 6, lg: 9 },
          color: "white",
          background:
            "radial-gradient(circle at 15% 10%, rgba(211,166,44,.28), transparent 34%), linear-gradient(145deg, #0b4f49 0%, #082d2a 72%)",
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar
            sx={{
              bgcolor: "secondary.main",
              color: "#17332f",
              fontWeight: 900,
            }}
          >
            V
          </Avatar>
          <Box>
            <Typography variant="h5" sx={{ lineHeight: 1, color: "white" }}>
              VNSF
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: "rgba(255,255,255,.65)" }}
            >
              Vietnam Scholarship Foundation
            </Typography>
          </Box>
        </Stack>
        <Box sx={{ maxWidth: 560 }}>
          <Typography
            variant="overline"
            sx={{ color: "secondary.light", letterSpacing: ".15em" }}
          >
            Scholarship Management System
          </Typography>
          <Typography
            variant="h2"
            sx={{
              mt: 2,
              mb: 3,
              color: "white",
              fontSize: { md: 42, lg: 54 },
              lineHeight: 1.08,
            }}
          >
            {t("common.securePlatform")}
          </Typography>
          <Typography
            sx={{ color: "rgba(255,255,255,.7)", maxWidth: 480, fontSize: 17 }}
          >
            VNSF kết nối dữ liệu học sinh, kết quả học tập và hỗ trợ tài chính
            trong một quy trình thống nhất.
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,.5)" }}>
          © VNSF · Scholarship operations platform
        </Typography>
      </Box>
      <Box
        component="main"
        sx={{ display: "grid", placeItems: "center", p: { xs: 2.5, sm: 5 } }}
      >
        <Paper
          sx={{
            width: "100%",
            maxWidth: 480,
            p: { xs: 3, sm: 5 },
            boxShadow: "0 24px 70px rgba(15,50,47,.12)",
          }}
        >
          <Stack
            component="form"
            spacing={3}
            onSubmit={(event) => void submit(event)}
            noValidate
          >
            <Avatar
              sx={{
                display: { md: "none" },
                bgcolor: "primary.main",
                fontWeight: 900,
              }}
            >
              V
            </Avatar>
            <Box>
              <Typography variant="h3" sx={{ fontSize: { xs: 30, sm: 36 } }}>
                {t("auth.login")}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                {t("common.signInHint")}
              </Typography>
            </Box>
            {serverError && (
              <Alert severity="error" role="alert">
                {serverError}
              </Alert>
            )}
            <TextField
              label={t("auth.email")}
              autoComplete="username"
              autoFocus
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
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={isSubmitting}
            >
              {isSubmitting ? t("common.loading") : t("auth.login")}
            </Button>
            <Button component={Link} to="/forgot-password" variant="text">
              {t("auth.forgot")}
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
