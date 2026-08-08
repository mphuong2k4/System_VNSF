import { useState } from "react";
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

type Extension = {
  id: string;
  obligation_id: string;
  student_code: string;
  full_name: string;
  reason: string;
  proposed_due_at: string;
  status: string;
  version: number;
};
type Letter = {
  id: string;
  student_id: string;
  period_id: string;
  student_code: string;
  full_name: string;
  status: string;
  draft_content: string;
  version: number;
};

export function ObligationsPage() {
  const { t } = useTranslation();
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [obligationId, setObligationId] = useState("");
  const [reason, setReason] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [studentId, setStudentId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");

  const fail = (error: unknown) =>
    setMessage(
      error instanceof HttpError ? error.body.message_key : "error.unexpected",
    );
  const load = async () => {
    try {
      const [e, l] = await Promise.all([
        api<Extension[]>("/extension-requests"),
        api<Letter[]>("/thank-you-letters"),
      ]);
      setExtensions(e);
      setLetters(l);
      setMessage("");
    } catch (error) {
      fail(error);
    }
  };
  const createExtension = async () => {
    try {
      await api(`/obligations/${obligationId}/extension-requests`, {
        method: "POST",
        body: JSON.stringify({
          reason,
          proposed_due_at: new Date(dueAt).toISOString(),
        }),
      });
      setReason("");
      await load();
    } catch (error) {
      fail(error);
    }
  };
  const decide = async (item: Extension, decision: "APPROVE" | "REJECT") => {
    const decisionReason = window.prompt(t("obligations.decisionReason"));
    if (!decisionReason) return;
    try {
      await api(`/extension-requests/${item.id}/decision`, {
        method: "POST",
        headers: { "if-match": String(item.version) },
        body: JSON.stringify({ decision, reason: decisionReason }),
      });
      await load();
    } catch (error) {
      fail(error);
    }
  };
  const createLetter = async () => {
    try {
      await api("/thank-you-letters", {
        method: "POST",
        body: JSON.stringify({
          student_id: studentId,
          period_id: periodId,
          content,
        }),
      });
      setContent("");
      await load();
    } catch (error) {
      fail(error);
    }
  };
  const submit = async (item: Letter) => {
    try {
      await api(`/thank-you-letters/${item.id}/submit`, {
        method: "POST",
        headers: { "if-match": String(item.version) },
      });
      await load();
    } catch (error) {
      fail(error);
    }
  };
  const review = async (
    item: Letter,
    decision: "APPROVE" | "RETURN" | "REJECT",
  ) => {
    const reasonCode =
      decision === "APPROVE"
        ? undefined
        : window.prompt(t("obligations.reasonCode"));
    if (decision !== "APPROVE" && !reasonCode) return;
    try {
      await api(`/thank-you-letters/${item.id}/review`, {
        method: "POST",
        headers: { "if-match": String(item.version) },
        body: JSON.stringify({
          decision,
          ...(reasonCode ? { reason_code: reasonCode } : {}),
        }),
      });
      await load();
    } catch (error) {
      fail(error);
    }
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t("obligations.title")}</Typography>
      {message && <Alert severity="error">{t(message)}</Alert>}
      <Button onClick={() => void load()}>{t("obligations.load")}</Button>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t("obligations.extensions")}</Typography>
          <TextField
            label={t("obligations.obligationId")}
            value={obligationId}
            onChange={(e) => setObligationId(e.target.value)}
          />
          <TextField
            label={t("obligations.proposedDueAt")}
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label={t("obligations.reason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
          />
          <Button onClick={() => void createExtension()}>
            {t("obligations.request")}
          </Button>
          {extensions.map((item) => (
            <Box key={item.id} sx={{ borderTop: 1, pt: 1 }}>
              <Typography>
                {item.student_code} · {item.full_name} · {item.status} ·{" "}
                {new Date(item.proposed_due_at).toLocaleString()}
              </Typography>
              {item.status === "REQUESTED" && (
                <Stack direction="row" spacing={1}>
                  <Button onClick={() => void decide(item, "APPROVE")}>
                    {t("obligations.approve")}
                  </Button>
                  <Button
                    color="error"
                    onClick={() => void decide(item, "REJECT")}
                  >
                    {t("obligations.reject")}
                  </Button>
                </Stack>
              )}
            </Box>
          ))}
        </Stack>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t("obligations.thankYou")}</Typography>
          <TextField
            label={t("obligations.studentId")}
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          />
          <TextField
            label={t("obligations.periodId")}
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
          />
          <TextField
            label={t("obligations.content")}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            multiline
            minRows={5}
          />
          <Button onClick={() => void createLetter()}>
            {t("obligations.createLetter")}
          </Button>
          {letters.map((item) => (
            <Box key={item.id} sx={{ borderTop: 1, pt: 1 }}>
              <Typography>
                {item.student_code} · {item.full_name} · {item.status}
              </Typography>
              <Typography sx={{ whiteSpace: "pre-wrap" }}>
                {item.draft_content}
              </Typography>
              <Stack direction="row" spacing={1}>
                {["DRAFT", "RETURNED"].includes(item.status) && (
                  <Button onClick={() => void submit(item)}>
                    {t("obligations.submit")}
                  </Button>
                )}
                {["SCHOOL_REVIEW", "PROGRAM_REVIEW"].includes(item.status) && (
                  <>
                    <Button onClick={() => void review(item, "APPROVE")}>
                      {t("obligations.approve")}
                    </Button>
                    <Button onClick={() => void review(item, "RETURN")}>
                      {t("obligations.return")}
                    </Button>
                    <Button
                      color="error"
                      onClick={() => void review(item, "REJECT")}
                    >
                      {t("obligations.reject")}
                    </Button>
                  </>
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
