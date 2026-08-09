import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL ?? "student.e2e@vnsf.test";
const password = process.env.E2E_USER_PASSWORD ?? "Vnsf-E2E-Password-2026!";

test("student navigation excludes management modules and rejects direct navigation", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel(/Email/i).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);

  for (const restrictedPath of [
    "/reporting",
    "/configuration",
    "/governance",
    "/administration",
  ]) {
    await expect(page.locator(`a[href="${restrictedPath}"]`)).toHaveCount(0);
  }

  await page.goto("/administration");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('a[href="/administration"]')).toHaveCount(0);
});
