import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL ?? "student.e2e@vnsf.test";
const password = process.env.E2E_USER_PASSWORD ?? "Vnsf-E2E-Password-2026!";

test("redirects an unauthenticated private route to sign in", async ({
  page,
}) => {
  await page.goto("/students");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fstudents$/);
  await expect(
    page.getByRole("heading", { name: /Đăng nhập|Sign in/i }),
  ).toBeVisible();
});

test("rejects invalid credentials without leaking account state", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel(/Email/i).fill("missing@vnsf.test");
  await page.getByLabel(/Mật khẩu|Password/i).fill("Definitely-Wrong-Password");
  await page.getByRole("button", { name: /Đăng nhập|Log in/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("logs in a synthetic student and loads the scoped dashboard", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel(/Email/i).fill(email);
  await page.getByLabel(/Mật khẩu|Password/i).fill(password);
  await page.getByRole("button", { name: /Đăng nhập|Log in/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("banner").getByText("VNSF", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("main h3").first()).toBeVisible();
  const languageButton = page.getByRole("button", {
    name: /Đổi ngôn ngữ|Change language/i,
  });
  const languageBefore = await languageButton.textContent();
  await languageButton.click();
  await expect(languageButton).not.toHaveText(languageBefore ?? "");
  await expect(
    page.getByRole("link", { name: /Học sinh|Students/i }).first(),
  ).toBeVisible();
});
