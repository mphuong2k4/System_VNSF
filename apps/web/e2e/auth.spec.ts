import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL ?? "student.e2e@vnsf.test";
const password = process.env.E2E_USER_PASSWORD ?? "Vnsf-E2E-Password-2026!";

test("redirects an unauthenticated private route to sign in", async ({
  page,
}) => {
  await page.goto("/students");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fstudents$/);
  await expect(page.locator("main h3")).toBeVisible();
});

test("rejects invalid credentials without leaking account state", async ({
  page,
}) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("missing@vnsf.test");
  await page
    .locator('input[name="password"]')
    .fill("Definitely-Wrong-Password");
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("logs in a synthetic student and loads the scoped dashboard", async ({
  page,
}) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("banner").getByText("VNSF", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("main h3").first()).toBeVisible();
  await expect(page.locator('a[href="/students"]').first()).toBeVisible();
});
