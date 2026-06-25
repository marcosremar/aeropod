import { test, expect } from "@playwright/test";

/**
 * E2E: video cut editing entry points (YouTube import + phone upload).
 *
 * Requires the dev server (auto-started by playwright.config.ts) and a
 * configured DATABASE_URL. Run with: npm run test:e2e
 */
test.describe("Video cut editing", () => {
  test("dashboard exposes YouTube import and phone upload entry points", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("button", { name: /Importar do YouTube/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Enviar vídeo do celular/i })
    ).toBeVisible();
  });

  test("opens the YouTube import modal with a URL field", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Importar do YouTube/i }).click();
    await expect(
      page.getByPlaceholder(/youtube\.com\/watch/i)
    ).toBeVisible();
  });

  test("rejects an invalid YouTube URL", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Importar do YouTube/i }).click();
    const input = page.getByPlaceholder(/youtube\.com\/watch/i);
    await input.fill("https://vimeo.com/123");
    await page.getByRole("button", { name: /^Importar$/i }).click();
    // stays on the modal / shows a validation message (no navigation to editor)
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("is usable at iPhone viewport width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await expect(
      page.getByRole("button", { name: /Importar do YouTube/i })
    ).toBeVisible();
  });
});
