import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL ?? "student.e2e@vnsf.test";
const password = process.env.E2E_USER_PASSWORD ?? "Vnsf-E2E-Password-2026!";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/Email/i).fill(email);
  await page.getByLabel(/Mật khẩu|Password/i).fill(password);
  await page.getByRole("button", { name: /Đăng nhập|Log in/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("main h3").first()).toBeVisible();
}

test("provides keyboard landmarks and a working skip link", async ({
  page,
}) => {
  await login(page);
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", {
    name: /Chuyển đến nội dung chính|Skip to main content/i,
  });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page.locator("nav[aria-label]").first()).toHaveAttribute(
    "aria-label",
  );
  await expect(page.getByRole("main")).toHaveCount(1);
});

test("dashboard remains usable without horizontal overflow on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await page.getByRole("button", { name: /Mở menu|Open menu/i }).click();
  await expect(page.locator("nav[aria-label]:visible").first()).toBeVisible();
  await page.keyboard.press("Escape");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await expect(page.locator("main h3").first()).toBeVisible();
});
