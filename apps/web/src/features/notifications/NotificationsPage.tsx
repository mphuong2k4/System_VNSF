import { useEffect, useState } from "react";
import { Alert, Box, Button, Paper, Stack, Typography } from "@vnsf/ui";
import { useTranslation } from "react-i18next";
import { api, HttpError } from "../../lib/api";

type Notification = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  email_status: string | null;
};

export function NotificationsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      setItems(await api<Notification[]>("/notifications?limit=100"));
      setError("");
    } catch (caught) {
      setError(
        caught instanceof HttpError
          ? caught.body.message_key
          : "errors.INTERNAL_ERROR",
      );
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const read = async (id: string) => {
    try {
      await api(`/notifications/${id}/read`, { method: "PATCH" });
      await load();
    } catch (caught) {
      setError(
        caught instanceof HttpError
          ? caught.body.message_key
          : "errors.INTERNAL_ERROR",
      );
    }
  };
  const readAll = async () => {
    try {
      await api("/notifications/read-all", { method: "PATCH" });
      await load();
    } catch (caught) {
      setError(
        caught instanceof HttpError
          ? caught.body.message_key
          : "errors.INTERNAL_ERROR",
      );
    }
  };
  return (
    <Stack spacing={2}>
      <Typography variant="h4">{t("notifications.title")}</Typography>
      {error && <Alert severity="error">{t(error)}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button onClick={() => void load()}>
          {t("notifications.refresh")}
        </Button>
        <Button onClick={() => void readAll()}>
          {t("notifications.readAll")}
        </Button>
      </Stack>
      {items.length === 0 && (
        <Typography>{t("notifications.empty")}</Typography>
      )}
      {items.map((item) => (
        <Paper key={item.id} sx={{ p: 2, opacity: item.read_at ? 0.65 : 1 }}>
          <Stack spacing={1}>
            <Typography variant="h6">
              {t(`notificationTypes.${item.type}`, { defaultValue: item.type })}
            </Typography>
            <Typography>
              {new Date(item.created_at).toLocaleString()} · Email:{" "}
              {item.email_status ?? "-"}
            </Typography>
            <Box
              component="pre"
              sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", m: 0 }}
            >
              {JSON.stringify(item.payload, null, 2)}
            </Box>
            {!item.read_at && (
              <Button onClick={() => void read(item.id)}>
                {t("notifications.markRead")}
              </Button>
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
