import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Avatar,
  Box,
  Button,
  IconButton,
  InputAdornment,
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
  const [showPassword, setShowPassword] = useState(false);
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
  const benefits = [
    {
      icon: "shield",
      title: "Minh bạch dữ liệu",
      detail: "Thông tin chính xác, bảo mật và tin cậy",
      color: "#248cf0",
      background: "#edf6ff",
    },
    {
      icon: "users",
      title: "Quản lý tập trung",
      detail: "Tất cả thông tin trên một nền tảng duy nhất",
      color: "#079c83",
      background: "#ebfaf6",
    },
    {
      icon: "chart",
      title: "Báo cáo trực quan",
      detail: "Thống kê, phân tích nhanh chóng, dễ hiểu",
      color: "#e49b09",
      background: "#fff8e8",
    },
  ];
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1.1fr minmax(440px,.9fr)" },
        overflow: "hidden",
        backgroundImage: "url('/assets/vnsf-login-background.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Box
        component="aside"
        sx={{
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "flex-start",
          position: "relative",
          p: { md: 5, lg: "5.5vh 7vw" },
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar
            sx={{
              width: 48,
              height: 48,
              bgcolor: "secondary.main",
              color: "white",
              fontSize: 24,
              fontWeight: 900,
            }}
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
        <Box
          sx={{
            maxWidth: 700,
            mt: { md: "2vh", lg: "2.5vh" },
            transform: { md: "translateY(-3vh)", lg: "translateY(-4.5vh)" },
          }}
        >
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 1,
              px: 1.8,
              py: 0.7,
              borderRadius: 4,
              bgcolor: "rgba(222,240,255,.82)",
              color: "#1686d9",
            }}
          >
            <Icon name="graduation" size={20} />
            <Typography
              variant="overline"
              sx={{ letterSpacing: ".08em", fontWeight: 850 }}
            >
              Hệ thống quản lý học bổng
            </Typography>
          </Box>
          <Typography
            variant="h2"
            sx={{
              mt: 1.5,
              mb: 1.75,
              color: "#17366d",
              fontSize: { md: 36, lg: 43 },
              lineHeight: 1.1,
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
            sx={{ maxWidth: 540, fontSize: 16, lineHeight: 1.7 }}
          >
            Quản lý học sinh, hồ sơ học tập, hỗ trợ tài chính và báo cáo trên
            một nền tảng thống nhất.
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 2.5,
              mt: 2,
            }}
          >
            {benefits.map((benefit) => (
              <Stack
                key={benefit.title}
                direction="row"
                spacing={1.3}
                alignItems="flex-start"
              >
                <Avatar
                  sx={{
                    bgcolor: benefit.background,
                    color: benefit.color,
                    boxShadow: "0 8px 24px rgba(30,100,170,.12)",
                  }}
                >
                  <Icon name={benefit.icon} size={23} />
                </Avatar>
                <Box>
                  <Typography variant="body2" fontWeight={800}>
                    {benefit.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", lineHeight: 1.4, mt: 0.25 }}
                  >
                    {benefit.detail}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Box>
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            position: "fixed",
            left: { md: 22, lg: 28 },
            bottom: { md: 14, lg: 18 },
            zIndex: 2,
          }}
        >
          © 2026 VNSF · Vietnam Scholarship Foundation
        </Typography>
      </Box>
      <Box
        component="main"
        sx={{ display: "grid", placeItems: "center", p: { xs: 2.5, sm: 4.5 } }}
      >
        <Paper
          sx={{
            width: "100%",
            maxWidth: 560,
            p: { xs: 3, sm: 5 },
            borderRadius: 5,
            bgcolor: "rgba(255,255,255,.94)",
            backdropFilter: "blur(8px)",
            boxShadow: "0 28px 80px rgba(35,82,138,.14)",
          }}
        >
          <Stack
            component="form"
            spacing={2.3}
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
                boxShadow: "0 0 0 1px #d7e8fa",
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
              placeholder="Nhập email của bạn"
              autoComplete="username"
              autoFocus
              error={!!errors.email}
              helperText={errors.email && t("errors.VALIDATION_EMAIL")}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Box sx={{ color: "#168be0", display: "flex" }}>
                      <Icon name="mail" size={20} />
                    </Box>
                  </InputAdornment>
                ),
              }}
              {...register("email")}
            />
            <TextField
              label={t("auth.password")}
              placeholder="Nhập mật khẩu"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              error={!!errors.password}
              helperText={errors.password && t("errors.VALIDATION_PASSWORD")}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Box sx={{ color: "#0899aa", display: "flex" }}>
                      <Icon name="lock" size={20} />
                    </Box>
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label={
                        showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                      }
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      <Icon name={showPassword ? "eyeOff" : "eye"} size={20} />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
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
                py: 1.2,
                background: "linear-gradient(90deg,#078f86,#138fe0)",
                "&:hover": {
                  background: "linear-gradient(90deg,#06776f,#087ccb)",
                },
              }}
            >
              <Box component="span" sx={{ flexGrow: 1 }}>
                {isSubmitting ? t("common.loading") : t("auth.login")}
              </Box>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  bgcolor: "white",
                  color: "#168be0",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icon name="arrow" size={17} />
              </Box>
            </Button>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box sx={{ height: "1px", bgcolor: "divider", flex: 1 }} />
              <Typography variant="caption" color="text.secondary">
                hoặc
              </Typography>
              <Box sx={{ height: "1px", bgcolor: "divider", flex: 1 }} />
            </Stack>
            <Button component={Link} to="/forgot-password" variant="text">
              {t("auth.forgot")}
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}

const paths: Record<string, string> = {
  graduation: "M2 7l10-5 10 5-10 5L2 7zm4 3.2V15l6 3 6-3v-4.8L12 14 6 10.2z",
  shield:
    "M12 2l8 3v6c0 5.1-3.4 9.4-8 11-4.6-1.6-8-5.9-8-11V5l8-3zm-1.2 13.2l5-5-1.4-1.4-3.6 3.6-1.8-1.8L7.6 12l3.2 3.2z",
  users:
    "M8 11a4 4 0 100-8 4 4 0 000 8zm8-1a3 3 0 100-6 3 3 0 000 6zM1 20v-2c0-3 3.1-5 7-5s7 2 7 5v2H1zm14.5 0v-2c0-1.5-.6-2.8-1.6-3.8.7-.1 1.4-.2 2.1-.2 3.9 0 7 2 7 5v1h-7.5z",
  chart:
    "M4 19h17v2H2V4h2v15zm3-2H5v-6h2v6zm5 0H9V7h3v10zm5 0h-3V9h3v8zm4 0h-2V4h2v13z",
  mail: "M3 5h18v14H3V5zm9 7l7-5H5l7 5zm-7 5h14V9l-7 5-7-5v8z",
  lock: "M6 10V8a6 6 0 1112 0v2h2v12H4V10h2zm2 0h8V8a4 4 0 00-8 0v2zm4 3a2 2 0 00-1 3.7V19h2v-2.3A2 2 0 0012 13z",
  eye: "M12 5c5.5 0 9.5 4.5 10.5 7-1 2.5-5 7-10.5 7S2.5 14.5 1.5 12C2.5 9.5 6.5 5 12 5zm0 2c-3.7 0-6.8 2.7-8.2 5 1.4 2.3 4.5 5 8.2 5s6.8-2.7 8.2-5C18.8 9.7 15.7 7 12 7zm0 2.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z",
  eyeOff:
    "M3.3 2L22 20.7 20.7 22l-3-3A11 11 0 0112 20C6.5 20 2.5 15.5 1.5 13c.7-1.8 2.8-4.5 5.8-6.1l-5.3-5.6L3.3 2zm6.1 8.5a3 3 0 004.1 4.1l-4.1-4.1zM12 6c5.5 0 9.5 4.5 10.5 7a13 13 0 01-2.7 4.1l-2.2-2.2c.8-1.4 1-3 .4-4.5A6.5 6.5 0 0012 6z",
  arrow: "M8 5l7 7-7 7 1.4 1.4L17.8 12 9.4 3.6 8 5z",
};
function Icon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      sx={{ width: size, height: size, fill: "currentColor", flex: "0 0 auto" }}
    >
      <path d={paths[name] ?? paths.shield} />
    </Box>
  );
}
