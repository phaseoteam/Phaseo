import { expect, test } from "@playwright/test";

test("keeps localized chat suggestions visible and selectable in RTL", async ({
	page,
}) => {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	const response = await page.goto("/ar-SA/chat", {
		waitUntil: "domcontentloaded",
	});
	expect(response?.status()).toBe(200);
	const acceptCookies = page.getByRole("button", { name: "قبول", exact: true });
	await expect(acceptCookies).toBeVisible();
	await acceptCookies.click();

	const composer = page.locator("[data-chat-composer-input='true']");
	await expect(composer).toBeVisible();
	await expect(composer).toHaveAttribute("placeholder", /[\u0600-\u06FF]/);

	const viewport = page
		.locator("[data-radix-scroll-area-viewport]")
		.filter({ hasText: "تحدي الكلمات المتناظرة" })
		.first();
	await expect
		.poll(() => viewport.evaluate((element) => element.scrollLeft))
		.toBeLessThan(0);
	const accessibleCard = viewport
		.locator('[aria-hidden="false"] button')
		.first();
	await expect(accessibleCard).toBeVisible();
	await expect(accessibleCard).toContainText(/[\u0600-\u06FF]/);

	const viewportBox = await viewport.boundingBox();
	const cardBox = await accessibleCard.boundingBox();
	expect(viewportBox).not.toBeNull();
	expect(cardBox).not.toBeNull();
	if (!viewportBox || !cardBox) return;
	expect(
		cardBox.x + cardBox.width > viewportBox.x &&
			cardBox.x < viewportBox.x + viewportBox.width,
	).toBe(true);

	await accessibleCard.click();
	await expect(composer).toHaveValue(/[\u0600-\u06FF]/);
	expect(pageErrors).toEqual([]);
});
