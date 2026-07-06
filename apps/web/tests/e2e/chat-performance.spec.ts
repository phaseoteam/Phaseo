import { expect, test } from "@playwright/test";

const RUN_CHAT_PERF_E2E = process.env.CHAT_PERF_E2E === "1";
const CHAT_PERF_MODEL = process.env.CHAT_PERF_MODEL ?? "openai/gpt-4o-mini";
const MAX_SUBMIT_TO_RENDER_MS = Number(
	process.env.CHAT_PERF_MAX_SUBMIT_TO_RENDER_MS ?? 500,
);
const MAX_SUBMIT_TO_REQUEST_MS = Number(
	process.env.CHAT_PERF_MAX_SUBMIT_TO_REQUEST_MS ?? 750,
);

test.describe("chat send performance", () => {
	test.skip(
		!RUN_CHAT_PERF_E2E,
		"Set CHAT_PERF_E2E=1 to run this local opt-in benchmark.",
	);

	test("measures send-to-visible-message and request kickoff latency", async ({
		page,
	}) => {
		await page.route("**/api/chat/text", async (route) => {
			await route.fulfill({
				status: 200,
				headers: {
					"content-type": "text/event-stream; charset=utf-8",
				},
				body: [
					"event: response.output_text.delta",
					'data: {"type":"response.output_text.delta","delta":"Measured."}',
					"",
					"event: response.completed",
					'data: {"type":"response.completed","response":{"output_text":"Measured."}}',
					"",
					"data: [DONE]",
					"",
				].join("\n"),
			});
		});

		const prompt = `Measure chat send latency ${Date.now()}`;
		await page.goto(
			`/chat?chatPerfAuth=1&model=${encodeURIComponent(CHAT_PERF_MODEL)}`,
		);

		const acceptCookies = page.getByRole("button", { name: "Accept" });
		if (await acceptCookies.isVisible().catch(() => false)) {
			await acceptCookies.click();
		}
		await expect(
			page.getByRole("button", { name: /^GPT 4o Mini/i }).first(),
		).toBeVisible();
		await page.waitForTimeout(500);

		const composer = page.locator("[data-chat-composer-input='true']");
		await expect(composer).toBeVisible();
		await composer.fill(prompt);
		await expect(composer).toHaveValue(prompt);
		await page.waitForTimeout(100);
		await expect(composer).toHaveValue(prompt);

		const sendButton = page.getByRole("button", { name: "Send message" });
		await expect(sendButton).toBeEnabled();
		await sendButton.click();

		await expect(
			page
				.locator("[data-chat-message-role='user']")
				.filter({ hasText: prompt }),
		).toBeVisible();

		const perfHandle = await page.waitForFunction(() => {
			const store = (
				window as typeof window & {
					__AI_STATS_CHAT_PERF__?: {
						getLatest: () => {
							id: string;
							messageId: string | null;
							measures: Record<string, number>;
						} | null;
					};
				}
			).__AI_STATS_CHAT_PERF__;
			const latest = store?.getLatest();
			const measures = latest?.measures;
			if (
				!latest ||
				measures?.["submit-to-user-message-rendered"] == null ||
				measures?.["submit-to-request-dispatch"] == null
			) {
				return null;
			}
			return {
				id: latest.id,
				messageId: latest.messageId,
				measures,
			};
		});
		const perf = await perfHandle.jsonValue();
		expect(perf).not.toBeNull();
		if (!perf) return;
		const measures = perf.measures as Record<string, number>;

		console.log("Chat send performance", JSON.stringify(perf, null, 2));

		expect(measures["submit-to-user-message-rendered"]).toBeLessThanOrEqual(
			MAX_SUBMIT_TO_RENDER_MS,
		);
		expect(measures["submit-to-request-dispatch"]).toBeLessThanOrEqual(
			MAX_SUBMIT_TO_REQUEST_MS,
		);
	});
});
