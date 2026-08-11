import { expect, test } from "@playwright/test";

test("loads the home page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Hello, World!")).toBeVisible();
});
