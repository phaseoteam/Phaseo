import { expect, test } from "@playwright/test";
import { instant } from "@next/playwright";

test.describe("instant top-level navigation", () => {
	test("shows the providers shell before streamed content resolves", async ({ page }) => {
		await page.goto("/models");
		const providersLink = page
			.getByRole("navigation")
			.getByRole("link", { name: "Providers" });
		await expect(providersLink).toBeVisible();

		await instant(page, async () => {
			await providersLink.click();
			await expect(
				page.getByRole("heading", { name: "API Providers" }),
			).toBeVisible();
		});

		await expect(page).toHaveURL(/\/api-providers$/);
		await expect(page.getByPlaceholder("Search providers...")).toBeVisible();
	});
});
