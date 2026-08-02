import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Paper, Skeleton, Stack, Typography } from "@vnsf/ui";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

type Session = {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  mfa_verified_at: string | null;
  current: boolean;
};
export function SessionsPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api<Session[]>("/auth/sessions"),
  });
  if (query.isLoading)
    return (
      <Stack spacing={2}>
        {[1, 2, 3].map((key) => (
          <Skeleton key={key} height={90} />
        ))}
      </Stack>
    );
  if (query.isError)
    return <Alert severity="error">{t("errors.INTERNAL_ERROR")}</Alert>;
  if (!query.data?.length)
    return <Alert severity="info">{t("auth.noSessions")}</Alert>;
  return (
    <Stack spacing={2}>
      <Typography variant="h4">{t("auth.sessions")}</Typography>
      {query.data.map((session) => (
        <Paper key={session.id} sx={{ p: 2 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            gap={2}
          >
            <Stack>
              <Typography>
                {session.current
                  ? t("auth.currentSession")
                  : t("auth.otherSession")}
              </Typography>
              <Typography variant="body2">
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(session.last_seen_at))}
              </Typography>
            </Stack>
            <Button
              variant="outlined"
              color="error"
              disabled={session.current}
              onClick={() => {
                void (async () => {
                  await api(`/auth/sessions/${session.id}`, {
                    method: "DELETE",
                  });
                  await client.invalidateQueries({ queryKey: ["sessions"] });
                })();
              }}
            >
              {t("auth.revoke")}
            </Button>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
