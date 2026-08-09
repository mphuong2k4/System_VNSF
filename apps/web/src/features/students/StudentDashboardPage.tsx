import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@vnsf/ui";
import { Link } from "react-router";
import { api } from "../../lib/api";

type Student = {
  id: string;
  student_code: string;
  full_name: string;
  date_of_birth: string;
  grade_level_current?: number;
  status: string;
  program_name?: string;
  school_name?: string;
};
type Submission = {
  id: string;
  type: string;
  status: string;
  updated_at?: string;
};
type Transfer = {
  id: string;
  amount: string;
  currency: string;
  status: string;
};
type Support = {
  id: string;
  program_code: string;
  status: string;
  support_value?: string;
  currency: string;
};

export function StudentDashboardPage() {
  const studentQuery = useQuery({
    queryKey: ["student-self"],
    queryFn: () => api<{ items: Student[] }>("/students?size=1"),
  });
  const student = studentQuery.data?.items[0];
  const submissions = useQuery({
    queryKey: ["student-dashboard", "submissions"],
    queryFn: () => api<Submission[]>("/submissions"),
    enabled: !!student,
  });
  const transfers = useQuery({
    queryKey: ["student-dashboard", "transfers"],
    queryFn: () => api<{ items: Transfer[] }>("/manual-transfers?size=10"),
    enabled: !!student,
  });
  const supports = useQuery({
    queryKey: ["student-dashboard", "supports", student?.id],
    queryFn: () => api<Support[]>(`/students/${student!.id}/support-programs`),
    enabled: !!student,
  });

  if (studentQuery.isLoading)
    return (
      <Stack spacing={2}>
        <Skeleton height={150} />
        <Skeleton height={180} />
      </Stack>
    );
  if (!student)
    return (
      <Alert severity="warning">
        Tài khoản chưa được liên kết với hồ sơ học sinh. Vui lòng liên hệ quản
        trị viên VNSF.
      </Alert>
    );

  const pending =
    submissions.data?.filter((item) =>
      ["DRAFT", "RETURNED", "SCHOOL_REVIEW", "PROGRAM_REVIEW"].includes(
        item.status,
      ),
    ).length ?? 0;
  const pendingTransfers =
    transfers.data?.items.filter(
      (item) => !["RECEIVED", "CLOSED", "CORRECTED"].includes(item.status),
    ).length ?? 0;
  return (
    <Stack spacing={3.5}>
      <Box>
        <Typography
          variant="overline"
          color="primary.main"
          sx={{ letterSpacing: ".12em", fontWeight: 850 }}
        >
          Cổng thông tin học sinh VNSF
        </Typography>
        <Typography variant="h3" sx={{ mt: 0.5, fontSize: { xs: 32, md: 45 } }}>
          Xin chào, {student.full_name}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Theo dõi hồ sơ học bổng và các công việc cần hoàn thành của bạn.
        </Typography>
      </Box>
      <Paper
        sx={{
          p: { xs: 2.5, md: 3.5 },
          background: "linear-gradient(120deg,#ffffff,#eef8ff)",
          overflow: "hidden",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={3}
          alignItems={{ md: "center" }}
        >
          <Box
            sx={{
              width: 76,
              height: 76,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              bgcolor: "#dff5f2",
              color: "primary.dark",
              fontSize: 28,
              fontWeight: 900,
            }}
          >
            {student.full_name.trim().split(/\s+/).slice(-1)[0]?.[0]}
          </Box>
          <Box sx={{ flexGrow: 1 }}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              flexWrap="wrap"
            >
              <Typography variant="h5">{student.full_name}</Typography>
              <Chip
                size="small"
                color="success"
                label={
                  student.status === "ACTIVE"
                    ? "Đang nhận học bổng"
                    : student.status
                }
              />
            </Stack>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Mã học sinh: <strong>{student.student_code}</strong> · Lớp{" "}
              {student.grade_level_current ?? "—"}
            </Typography>
            <Typography color="text.secondary">
              {student.school_name ?? "Chưa cập nhật trường"} ·{" "}
              {student.program_name ?? "Chương trình học bổng VNSF"}
            </Typography>
          </Box>
          <Button component={Link} to="/students" variant="contained">
            Xem hồ sơ của tôi
          </Button>
        </Stack>
      </Paper>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3,1fr)" },
          gap: 2,
        }}
      >
        {[
          ["Hồ sơ cần xử lý", pending, "/submissions"],
          ["Chuyển khoản cần xác nhận", pendingTransfers, "/transfers"],
          ["Chương trình hỗ trợ", supports.data?.length ?? 0, "/assistance"],
        ].map(([label, value, path]) => (
          <Paper
            key={String(label)}
            sx={{
              p: 2.5,
              borderTop: "4px solid",
              borderTopColor: "primary.main",
            }}
          >
            <Typography color="text.secondary">{label}</Typography>
            <Typography variant="h3" sx={{ my: 1 }}>
              {value}
            </Typography>
            <Button component={Link} to={String(path)} size="small">
              Xem chi tiết →
            </Button>
          </Paper>
        ))}
      </Box>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5">Thông tin cá nhân</Typography>
        <Box
          sx={{
            mt: 2,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)" },
            gap: 2,
          }}
        >
          <Info
            label="Ngày sinh"
            value={new Date(student.date_of_birth).toLocaleDateString("vi-VN")}
          />
          <Info
            label="Khối lớp hiện tại"
            value={
              student.grade_level_current
                ? `Lớp ${student.grade_level_current}`
                : "Chưa cập nhật"
            }
          />
          <Info
            label="Trường học"
            value={student.school_name ?? "Chưa cập nhật"}
          />
          <Info
            label="Chương trình"
            value={student.program_name ?? "Chưa cập nhật"}
          />
        </Box>
      </Paper>
    </Stack>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#f5f9fe" }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography fontWeight={750} sx={{ mt: 0.5 }}>
        {value}
      </Typography>
    </Box>
  );
}
