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
import { Link } from "react-router";
import { api, HttpError } from "../../lib/api";

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
      } else location.assign(returnTo);
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
        gridTemplateColumns: { xs: "1fr", md: "1.15fr minmax(440px,.85fr)" },
        position: "relative",
        overflow: "hidden",
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.08),rgba(255,255,255,.08)),url('/assets/vnsf-login-background.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Box
        component="aside"
        sx={{
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "space-between",
          p: { md: 6, lg: "7vh 8vw" },
          zIndex: 1,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar
            sx={{ bgcolor: "secondary.main", color: "white", fontWeight: 900 }}
          >
            V
          </Avatar>
          <Box>
            <Typography variant="h5" sx={{ lineHeight: 1, color: "#143575" }}>
              VNSF
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Vietnam Scholarship Foundation
            </Typography>
          </Box>
        </Stack>
        <Box sx={{ maxWidth: 650 }}>
          <Typography
            variant="overline"
            sx={{ color: "#1686d9", letterSpacing: ".1em", fontWeight: 800 }}
          >
            🎓 Hệ thống quản lý học bổng
          </Typography>
          <Typography
            variant="h2"
            sx={{
              mt: 2,
              mb: 3,
              color: "#17366d",
              fontSize: { md: 42, lg: 54 },
              lineHeight: 1.08,
            }}
          >
            Nền tảng quản lý học bổng
            <Box
              component="span"
              sx={{ display: "block", color: "primary.main" }}
            >
              hiện đại, minh bạch và hiệu quả
            </Box>
          </Typography>
          <Typography
            color="text.secondary"
            sx={{ maxWidth: 520, fontSize: 17, lineHeight: 1.7 }}
          >
            Quản lý học sinh, hồ sơ học tập, hỗ trợ tài chính và báo cáo trên
            một nền tảng thống nhất.
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 2,
              mt: 5,
            }}
          >
            {[
              ["✓", "Minh bạch dữ liệu"],
              ["◎", "Quản lý tập trung"],
              ["↗", "Báo cáo trực quan"],
            ].map(([icon, label]) => (
              <Stack
                key={label}
                direction="row"
                spacing={1.2}
                alignItems="center"
              >
                <Avatar
                  sx={{
                    bgcolor: "white",
                    color: "primary.main",
                    boxShadow: "0 8px 24px rgba(30,100,170,.12)",
                  }}
                >
                  {icon}
                </Avatar>
                <Typography variant="body2" fontWeight={750}>
                  {label}
                </Typography>
              </Stack>
            ))}
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary">
          © 2026 VNSF · Vietnam Scholarship Foundation
        </Typography>
      </Box>
      <Box
        component="main"
        sx={{
          display: "grid",
          placeItems: "center",
          p: { xs: 2.5, sm: 5 },
          zIndex: 1,
        }}
      >
        <Paper
          sx={{
            width: "100%",
            maxWidth: 560,
            p: { xs: 3, sm: 6 },
            borderRadius: 5,
            boxShadow: "0 28px 80px rgba(35,82,138,.14)",
          }}
        >
          <Stack
            component="form"
            spacing={2.5}
            onSubmit={(event) => void submit(event)}
            noValidate
          >
            <Avatar
              sx={{
                mx: "auto",
                width: 68,
                height: 68,
                bgcolor: "secondary.main",
                color: "white",
                fontSize: 31,
                fontWeight: 900,
                border: "8px solid #f1f7ff",
              }}
            >
              V
            </Avatar>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="h3" sx={{ fontSize: { xs: 28, sm: 34 } }}>
                Đăng nhập hệ thống
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Vui lòng đăng nhập để tiếp tục quản lý chương trình học bổng.
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
            <Box
              component="label"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                color: "text.secondary",
                cursor: "pointer",
              }}
            >
              <Box
                component="input"
                type="checkbox"
                defaultChecked
                sx={{ width: 17, height: 17, accentColor: "#078f86" }}
              />
              <Typography variant="body2">Ghi nhớ đăng nhập</Typography>
            </Box>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={isSubmitting}
              sx={{
                py: 1.35,
                background: "linear-gradient(90deg,#078f86,#138fe0)",
                "&:hover": {
                  background: "linear-gradient(90deg,#06776f,#087ccb)",
                },
              }}
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
