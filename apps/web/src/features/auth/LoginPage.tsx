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
import { api, HttpError } from "../../lib/api";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
type Form = z.infer<typeof schema>;

const loginFieldSx = {
  "& .MuiInputLabel-root": {
    color: "#607590",
    fontWeight: 600,
  },
  "& .MuiOutlinedInput-root": {
    minHeight: 54,
    borderRadius: 3,
    bgcolor: "#f8fbff",
    transition: "background-color .2s ease, box-shadow .2s ease",
    "& fieldset": { borderColor: "#d5e1ef" },
    "&:hover": {
      bgcolor: "#ffffff",
      "& fieldset": { borderColor: "#9eb9d5" },
    },
    "&.Mui-focused": {
      bgcolor: "#ffffff",
      boxShadow: "0 0 0 4px rgba(7,143,134,.10)",
      "& fieldset": { borderWidth: 1.5 },
    },
  },
  "& .MuiInputBase-input": {
    fontSize: 15,
    fontWeight: 500,
  },
};

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
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1.1fr minmax(440px,.9fr)" },
        overflow: "auto",
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
          p: { md: 5, lg: "5.5vh 5vw" },
        }}
      >
        <Box
          role="img"
          aria-label="Vietnam Scholarship Foundation"
          sx={{
            position: "relative",
            overflow: "hidden",
            width: { md: 185, lg: 195 },
            height: { md: 80, lg: 84 },
          }}
        >
          <Box
            component="img"
            src="/assets/logo-vnsf.png"
            alt=""
            sx={{
              position: "absolute",
              width: { md: 190, lg: 200 },
              maxWidth: "none",
              height: "auto",
              top: { md: -51, lg: -54 },
              left: { md: -2, lg: -2 },
              imageRendering: "auto",
            }}
          />
        </Box>
        <Box
          sx={{
            maxWidth: 700,
            mt: { md: "6vh", lg: "7vh" },
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
              fontSize: { md: 40, lg: 46 },
              fontWeight: 750,
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
            sx={{
              maxWidth: 560,
              fontSize: { md: 16, lg: 18 },
              fontWeight: 550,
              lineHeight: 1.65,
            }}
          >
            Quản lý học sinh, hồ sơ học tập, hỗ trợ tài chính và báo cáo trên
            một nền tảng thống nhất.
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 1.5,
              mt: 2.5,
            }}
          >
            {benefits.map((benefit) => (
              <Stack
                key={benefit.title}
                direction="row"
                spacing={1.2}
                alignItems="center"
                sx={{
                  minHeight: 82,
                  px: 1.5,
                  py: 1.25,
                  borderRadius: 3,
                  bgcolor: "rgba(255,255,255,.94)",
                  border: "1px solid rgba(205,222,241,.95)",
                  boxShadow: "0 10px 28px rgba(31,77,128,.10)",
                }}
              >
                <Avatar
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor: benefit.background,
                    color: benefit.color,
                    boxShadow: "none",
                  }}
                >
                  <Icon name={benefit.icon} size={23} />
                </Avatar>
                <Box>
                  <Typography
                    sx={{
                      color: "#10284d",
                      fontSize: 14,
                      fontWeight: 750,
                      lineHeight: 1.25,
                    }}
                  >
                    {benefit.title}
                  </Typography>
                  <Typography
                    sx={{
                      display: "block",
                      color: "#526985",
                      fontSize: 12,
                      fontWeight: 500,
                      lineHeight: 1.35,
                      mt: 0.4,
                    }}
                  >
                    {benefit.detail}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Box>
        </Box>
      </Box>
      <Box
        component="main"
        sx={{ display: "grid", placeItems: "center", p: { xs: 2.5, sm: 4.5 } }}
      >
        <Paper
          sx={{
            position: "relative",
            overflow: "hidden",
            width: "100%",
            maxWidth: 530,
            p: { xs: 3, sm: 5.5 },
            borderRadius: { xs: 4, sm: "30px" },
            bgcolor: "rgba(255,255,255,.985)",
            border: "1px solid rgba(255,255,255,.95)",
            boxShadow:
              "0 30px 90px rgba(25,67,116,.18), 0 2px 8px rgba(25,67,116,.06)",
            "&::before": {
              content: '""',
              position: "absolute",
              inset: "0 0 auto",
              height: 5,
              background: "linear-gradient(90deg,#078f86,#1596df,#e3a008)",
            },
          }}
        >
          <Stack
            component="form"
            spacing={2.2}
            onSubmit={(event) => void submit(event)}
            noValidate
          >
            <Box sx={{ textAlign: "center", mb: 0.5 }}>
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.8,
                  px: 1.5,
                  py: 0.65,
                  mb: 2,
                  borderRadius: 99,
                  color: "#087c77",
                  bgcolor: "#eaf8f6",
                  border: "1px solid #cdece8",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 750, letterSpacing: ".06em" }}
                >
                  CỔNG THÔNG TIN VNSF
                </Typography>
              </Box>
              <Typography
                variant="h3"
                sx={{
                  color: "#10284d",
                  fontSize: { xs: 30, sm: 38 },
                  fontWeight: 750,
                  letterSpacing: "-.025em",
                  lineHeight: 1.15,
                }}
              >
                Đăng nhập hệ thống
              </Typography>
              <Typography
                color="text.secondary"
                sx={{ mt: 1.2, fontSize: { xs: 14, sm: 16 }, fontWeight: 500 }}
              >
                Vui lòng đăng nhập để tiếp tục.
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
              sx={loginFieldSx}
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
              sx={loginFieldSx}
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
                minHeight: 54,
                borderRadius: 3,
                fontSize: 16,
                background: "linear-gradient(90deg,#078f86,#138fe0)",
                boxShadow: "0 12px 26px rgba(12,139,158,.22)",
                "&:hover": {
                  background: "linear-gradient(90deg,#06776f,#087ccb)",
                  boxShadow: "0 14px 30px rgba(12,139,158,.28)",
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
