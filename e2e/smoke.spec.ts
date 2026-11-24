import { test, expect } from "@playwright/test";

/**
 * Smoke: app boots, auth page renders, sign-in form is interactive.
 * Real flow tests live in subsequent sprint turns (B5.3, B5.11).
 */
test("auth page renders sign-in form", async ({ page }) => {
  await page.goto("/auth");
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("landing page responds", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBeLessThan(500);
});
