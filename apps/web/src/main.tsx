import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AppBar,
  Box,
  Button,
  Container,
  CssBaseline,
  Toolbar,
  Typography,
} from "@vnsf/ui";
import "./i18n";
import { useTranslation } from "react-i18next";
import { LoginPage } from "./features/auth/LoginPage";
import { MfaPage } from "./features/auth/MfaPage";
import { ForgotPasswordPage } from "./features/auth/ForgotPasswordPage";
import { SetPasswordPage } from "./features/auth/SetPasswordPage";
import { SessionsPage } from "./features/auth/SessionsPage";
import { ConfigurationPage } from "./features/configuration/ConfigurationPage";
import { StudentsPage } from "./features/students/StudentsPage";
import { SubmissionsPage } from "./features/academics/SubmissionsPage";
import { DocumentsPage } from "./features/documents/DocumentsPage";
import { BankingPage } from "./features/banking/BankingPage";
import { TransfersPage } from "./features/transfers/TransfersPage";
import { AssistancePage } from "./features/assistance/AssistancePage";
import { ObligationsPage } from "./features/obligations/ObligationsPage";
import { NotificationsPage } from "./features/notifications/NotificationsPage";
const query = new QueryClient();
function Shell() {
  const { t, i18n } = useTranslation();
  return (
    <>
      <CssBaseline />
      <AppBar position="static">
        <Toolbar>
          <Typography sx={{ flexGrow: 1 }}>VNSF</Typography>
          <Button
            color="inherit"
            onClick={() =>
              void i18n.changeLanguage(
                i18n.language === "vi-VN" ? "en-US" : "vi-VN",
              )
            }
            aria-label={t("language")}
          >
            {i18n.language === "vi-VN" ? "EN" : "VI"}
          </Button>
        </Toolbar>
      </AppBar>
      <Container>
        <Box component="nav" sx={{ display: "flex", gap: 2, my: 2 }}>
          <Link to="/">{t("dashboard")}</Link>
          <Link to="/students">{t("students")}</Link>
          <Link to="/submissions">{t("submissions")}</Link>
          <Link to="/transfers">{t("transfers")}</Link>
          <Link to="/sessions">{t("auth.sessions")}</Link>
          <Link to="/configuration">{t("configuration.title")}</Link>
          <Link to="/documents">{t("documents.title")}</Link>
          <Link to="/banking">{t("banking.title")}</Link>
          <Link to="/assistance">{t("assistance.title")}</Link>
          <Link to="/obligations">{t("obligations.title")}</Link>
          <Link to="/notifications">{t("notifications.title")}</Link>
        </Box>
        <Routes>
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/configuration" element={<ConfigurationPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/submissions" element={<SubmissionsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/banking" element={<BankingPage />} />
          <Route path="/transfers" element={<TransfersPage />} />
          <Route path="/assistance" element={<AssistancePage />} />
          <Route path="/obligations" element={<ObligationsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
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
      </Container>
    </>
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
    <QueryClientProvider client={query}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
