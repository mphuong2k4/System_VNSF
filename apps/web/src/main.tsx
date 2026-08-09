import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Divider,
  Container,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  Toolbar,
  ThemeProvider,
  Typography,
} from "@vnsf/ui";
import "./i18n";
import { useTranslation } from "react-i18next";
import { LoginPage } from "./features/auth/LoginPage";
import { MfaPage } from "./features/auth/MfaPage";
import { ForgotPasswordPage } from "./features/auth/ForgotPasswordPage";
import { SetPasswordPage } from "./features/auth/SetPasswordPage";
import { api, AUTHENTICATION_REQUIRED_EVENT, HttpError } from "./lib/api";
import { vnsfTheme } from "./theme";
const SessionsPage = lazy(() =>
  import("./features/auth/SessionsPage.js").then((module) => ({
    default: module.SessionsPage,
  })),
);
const ConfigurationPage = lazy(() =>
  import("./features/configuration/ConfigurationPage.js").then((module) => ({
    default: module.ConfigurationPage,
  })),
);
const StudentsPage = lazy(() =>
  import("./features/students/StudentsPage.js").then((module) => ({
    default: module.StudentsPage,
  })),
);
const SubmissionsPage = lazy(() =>
  import("./features/academics/SubmissionsPage.js").then((module) => ({
    default: module.SubmissionsPage,
  })),
);
const DocumentsPage = lazy(() =>
  import("./features/documents/DocumentsPage.js").then((module) => ({
    default: module.DocumentsPage,
  })),
);
const BankingPage = lazy(() =>
  import("./features/banking/BankingPage.js").then((module) => ({
    default: module.BankingPage,
  })),
);
const TransfersPage = lazy(() =>
  import("./features/transfers/TransfersPage.js").then((module) => ({
    default: module.TransfersPage,
  })),
);
const AssistancePage = lazy(() =>
  import("./features/assistance/AssistancePage.js").then((module) => ({
    default: module.AssistancePage,
  })),
);
const ObligationsPage = lazy(() =>
  import("./features/obligations/ObligationsPage.js").then((module) => ({
    default: module.ObligationsPage,
  })),
);
const NotificationsPage = lazy(() =>
  import("./features/notifications/NotificationsPage.js").then((module) => ({
    default: module.NotificationsPage,
  })),
);
const ReportingPage = lazy(() =>
  import("./features/reporting/ReportingPage.js").then((module) => ({
    default: module.ReportingPage,
  })),
);
const GovernancePage = lazy(() =>
  import("./features/governance/GovernancePage.js").then((module) => ({
    default: module.GovernancePage,
  })),
);
const AdministrationPage = lazy(() =>
  import("./features/administration/AdministrationPage.js").then((module) => ({
    default: module.AdministrationPage,
  })),
);
const query = new QueryClient();
const drawerWidth = 272;
type Profile = {
  preferred_locale: "vi-VN" | "en-US";
  roles: string[];
  school_ids: string[];
  student_id: string | null;
  mfa_enabled: boolean;
};
const navigation = [
  { path: "/", key: "dashboard", mark: "01" },
  { path: "/students", key: "students", mark: "HS" },
  { path: "/submissions", key: "submissions", mark: "HT" },
  { path: "/transfers", key: "transfers", mark: "CK" },
  { path: "/assistance", key: "assistance.title", mark: "HT" },
  { path: "/obligations", key: "obligations.title", mark: "NV" },
  { path: "/documents", key: "documents.title", mark: "TL" },
  { path: "/banking", key: "banking.title", mark: "NH" },
  { path: "/notifications", key: "notifications.title", mark: "TB" },
  {
    path: "/reporting",
    key: "reporting.title",
    mark: "BC",
    roles: ["SUPER_ADMIN", "PROGRAM_MANAGER", "SCHOOL_MANAGER"],
  },
  {
    path: "/configuration",
    key: "configuration.title",
    mark: "CH",
    roles: ["SUPER_ADMIN", "PROGRAM_MANAGER"],
  },
  {
    path: "/governance",
    key: "governance.title",
    mark: "QT",
    roles: ["SUPER_ADMIN"],
  },
  {
    path: "/administration",
    key: "administration.title",
    mark: "QT",
    roles: ["SUPER_ADMIN"],
  },
  { path: "/sessions", key: "auth.sessions", mark: "AT" },
] as const;
function Shell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>();
  useEffect(() => {
    const redirectToAuthentication = (event?: Event) => {
      const code = (event as CustomEvent<{ code?: string }> | undefined)?.detail
        ?.code;
      const returnTo = `${location.pathname}${location.search}`;
      void navigate(
        code === "AUTH_MFA_REQUIRED"
          ? `/mfa?returnTo=${encodeURIComponent(returnTo)}`
          : `/login?returnTo=${encodeURIComponent(returnTo)}`,
        { replace: true },
      );
    };
    window.addEventListener(
      AUTHENTICATION_REQUIRED_EVENT,
      redirectToAuthentication,
    );
    void api<Profile>("/auth/profile/preferences")
      .then(async (profile) => {
        await i18n.changeLanguage(profile.preferred_locale);
        setProfile(profile);
      })
      .catch((error: unknown) => {
        if (!(error instanceof HttpError) || error.status !== 401)
          void navigate("/login", { replace: true });
      });
    return () =>
      window.removeEventListener(
        AUTHENTICATION_REQUIRED_EVENT,
        redirectToAuthentication,
      );
  }, [i18n, location.pathname, location.search, navigate]);
  const changeLanguage = async () => {
    const preferred_locale = i18n.language.startsWith("vi") ? "en-US" : "vi-VN";
    await i18n.changeLanguage(preferred_locale);
    await api("/auth/profile/preferences", {
      method: "PATCH",
      body: JSON.stringify({ preferred_locale }),
    }).catch(() => undefined);
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/login");
  };
  const visibleNavigation = navigation.filter(
    (item) =>
      !("roles" in item) ||
      item.roles.some((role) => profile?.roles.includes(role)),
  );
  const isProgramManager = profile?.roles.some((role) =>
    ["SUPER_ADMIN", "PROGRAM_MANAGER"].includes(role),
  );
  const isReportingManager = profile?.roles.some((role) =>
    ["SUPER_ADMIN", "PROGRAM_MANAGER", "SCHOOL_MANAGER"].includes(role),
  );
  const isSuperAdmin = profile?.roles.includes("SUPER_ADMIN");
  useEffect(() => {
    if (!profile) return;
    const requested = navigation.find(
      (item) => item.path !== "/" && location.pathname.startsWith(item.path),
    );
    if (
      requested &&
      "roles" in requested &&
      !requested.roles.some((role) => profile.roles.includes(role))
    )
      void navigate("/", { replace: true });
  }, [location.pathname, navigate, profile]);
  if (!profile)
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Stack spacing={2} sx={{ width: "min(420px, 80vw)" }}>
          <Skeleton variant="rounded" height={64} />
          <Skeleton variant="rounded" height={180} />
        </Stack>
      </Box>
    );
  const current = visibleNavigation.find((item) =>
    item.path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(item.path),
  );
  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{ px: 3, py: 2.5, display: "flex", alignItems: "center", gap: 1.5 }}
      >
        <Avatar
          sx={{ bgcolor: "secondary.main", color: "white", fontWeight: 900 }}
        >
          V
        </Avatar>
        <Box>
          <Typography variant="h6" sx={{ color: "#17366d", lineHeight: 1.1 }}>
            VNSF
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Scholarship Management
          </Typography>
        </Box>
      </Box>
      <Divider />
      <Typography
        variant="overline"
        sx={{
          px: 3,
          pt: 2.5,
          pb: 1,
          color: "#7a8da8",
          letterSpacing: ".12em",
        }}
      >
        {t("primaryNavigation")}
      </Typography>
      <List
        component="nav"
        aria-label={t("primaryNavigation")}
        sx={{ px: 1.5, py: 0, overflowY: "auto" }}
      >
        {visibleNavigation.map((item) => {
          const active =
            item.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.path);
          return (
            <ListItemButton
              key={item.path}
              component={Link}
              to={item.path}
              selected={active}
              onClick={() => setMobileOpen(false)}
              sx={{
                mb: 0.5,
                borderRadius: 2,
                color: "#526985",
                "&.Mui-selected": {
                  bgcolor: "#e7f5ff",
                  color: "#087f79",
                  "&:hover": { bgcolor: "#dcefff" },
                },
                "&:hover": { bgcolor: "#f0f7ff", color: "#17366d" },
              }}
            >
              <Box
                sx={{
                  width: 31,
                  height: 31,
                  display: "grid",
                  placeItems: "center",
                  mr: 1.5,
                  borderRadius: 1.5,
                  bgcolor: active ? "#d7f2ef" : "#edf3fa",
                  color: active ? "#087f79" : "inherit",
                  fontSize: 11,
                  fontWeight: 900,
                }}
              >
                {item.mark}
              </Box>
              <ListItemText
                primary={t(item.key)}
                primaryTypographyProps={{
                  fontSize: 14,
                  fontWeight: active ? 750 : 550,
                }}
              />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ mt: "auto", p: 2 }}>
        <Paper
          sx={{
            p: 1.5,
            bgcolor: "#f2f8ff",
            borderColor: "#deebf7",
            color: "#17366d",
            boxShadow: "none",
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {t("common.systemStatus")}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            ● {t("common.operational")}
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <CssBaseline />
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: "fixed",
          left: 8,
          top: 8,
          zIndex: 2000,
          bgcolor: "background.paper",
          color: "text.primary",
          p: 1,
          transform: "translateY(-200%)",
          "&:focus": { transform: "translateY(0)" },
        }}
      >
        {t("skipToContent")}
      </Box>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "rgba(255,255,255,.94)",
          backdropFilter: "blur(10px)",
        }}
      >
        <Toolbar sx={{ minHeight: 72 }}>
          <IconButton
            aria-label={t("common.openMenu")}
            onClick={() => setMobileOpen(true)}
            sx={{ display: { md: "none" }, mr: 1 }}
          >
            ☰
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="caption" color="text.secondary">
              VNSF / {current ? t(current.key) : t("dashboard")}
            </Typography>
            <Typography variant="h6">
              {current ? t(current.key) : t("dashboard")}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            onClick={() => void changeLanguage()}
            aria-label={t("language")}
          >
            {i18n.language.startsWith("vi") ? "EN" : "VI"}
          </Button>
          <Avatar
            sx={{
              ml: 1.5,
              width: 38,
              height: 38,
              bgcolor: "primary.light",
              color: "primary.dark",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            VNSF
          </Avatar>
          <Button sx={{ ml: 1 }} onClick={() => void logout()}>
            {t("auth.logout")}
          </Button>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        aria-label={t("primaryNavigation")}
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": {
              width: drawerWidth,
              bgcolor: "#ffffff",
              borderRight: "1px solid #e2ebf5",
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              width: drawerWidth,
              bgcolor: "#ffffff",
              borderRight: "1px solid #e2ebf5",
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        sx={{ flexGrow: 1, minWidth: 0, pt: "96px", pb: 6 }}
      >
        <Container maxWidth="xl">
          <Suspense
            fallback={
              <Stack spacing={2}>
                <Skeleton height={52} />
                <Skeleton height={180} />
                <Skeleton height={180} />
              </Stack>
            }
          >
            <Routes>
              <Route path="/sessions" element={<SessionsPage />} />
              {isProgramManager && (
                <Route path="/configuration" element={<ConfigurationPage />} />
              )}
              <Route path="/students" element={<StudentsPage />} />
              <Route path="/submissions" element={<SubmissionsPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/banking" element={<BankingPage />} />
              <Route path="/transfers" element={<TransfersPage />} />
              <Route path="/assistance" element={<AssistancePage />} />
              <Route path="/obligations" element={<ObligationsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              {isReportingManager && (
                <Route path="/reporting" element={<ReportingPage manager />} />
              )}
              {isSuperAdmin && (
                <Route path="/governance" element={<GovernancePage />} />
              )}
              {isSuperAdmin && (
                <Route
                  path="/administration"
                  element={<AdministrationPage />}
                />
              )}
              <Route
                path="/"
                element={
                  <ReportingPage
                    manager={profile.roles.some((role) => role !== "STUDENT")}
                  />
                }
              />
              <Route
                path="*"
                element={
                  <Box>
                    <Typography variant="h4">{t("dashboard")}</Typography>
                    <Typography>{t("notice")}</Typography>
                  </Box>
                }
              />
            </Routes>
          </Suspense>
        </Container>
      </Box>
    </Box>
  );
}
function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mfa" element={<MfaPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route
        path="/reset-password"
        element={<SetPasswordPage mode="reset" />}
      />
      <Route path="/activate" element={<SetPasswordPage mode="activate" />} />
      <Route path="*" element={<Shell />} />
    </Routes>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={vnsfTheme}>
      <QueryClientProvider client={query}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
