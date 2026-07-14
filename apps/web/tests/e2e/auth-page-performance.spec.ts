import { expect, test } from "@playwright/test";

const RUN_AUTH_PAGE_PERF_E2E = process.env.AUTH_PAGE_PERF_E2E === "1";
const MAX_AUTH_FORM_VISIBLE_MS = Number(
	process.env.AUTH_PAGE_PERF_MAX_FORM_VISIBLE_MS ?? 1200,
);

const authRoutes = [
	{
		name: "plain sign-in",
		path: "/sign-in",
		heading: "Welcome back",
		button: "Sign in with email",
	},
	{
		name: "sign-in with returnUrl",
		path: "/sign-in?returnUrl=%2Fsettings%2Fbeta",
		heading: "Welcome back",
		button: "Sign in with email",
	},
	{
		name: "plain sign-up",
		path: "/sign-up",
		heading: "Welcome to Phaseo",
		button: "Sign up with email",
	},
	{
		name: "sign-up with returnUrl",
		path: "/sign-up?returnUrl=%2Fsettings%2Fbeta",
		heading: "Welcome to Phaseo",
		button: "Sign up with email",
	},
] as const;

test.describe("auth page performance", () => {
	test.describe.configure({ mode: "serial" });

	test.skip(
		!RUN_AUTH_PAGE_PERF_E2E,
		"Set AUTH_PAGE_PERF_E2E=1 to run this local opt-in benchmark.",
	);

	for (const route of authRoutes) {
		test(`${route.name} renders form controls quickly`, async ({ page }) => {
			await page.goto(route.path, { waitUntil: "domcontentloaded" });
			await expect(
				page.getByRole("heading", { name: route.heading }),
			).toBeVisible();
			await page.goto("about:blank");

			const startedAt = performance.now();

			await page.goto(route.path, { waitUntil: "domcontentloaded" });

			await expect(
				page.getByRole("heading", { name: route.heading }),
			).toBeVisible();
			await expect(page.getByLabel("Email")).toBeVisible();
			await expect(page.getByLabel("Password")).toBeVisible();
			await expect(
				page.getByRole("button", { name: route.button }),
			).toBeVisible();

			const formVisibleMs = performance.now() - startedAt;
			console.log(
				"Auth page performance",
				JSON.stringify(
					{
						route: route.path,
						formVisibleMs: Math.round(formVisibleMs),
					},
					null,
					2,
				),
			);

			expect(formVisibleMs).toBeLessThanOrEqual(MAX_AUTH_FORM_VISIBLE_MS);
			await expect(page.getByText(/loading auth/i)).toHaveCount(0);
			await expect(page.getByText(/^loading$/i)).toHaveCount(0);
		});
	}
});
