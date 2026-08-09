import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL ?? "student.e2e@vnsf.test";
const password = process.env.E2E_USER_PASSWORD ?? "Vnsf-E2E-Password-2026!";

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);
}

test("provides keyboard landmarks and a working skip link", async ({
  page,
}) => {
  await login(page);
  await expect(page.locator("nav:visible").first()).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.locator('a[href="#main-content"]');
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("dashboard remains usable without horizontal overflow on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await expect(page.locator("main h3").first()).toBeVisible();
});
