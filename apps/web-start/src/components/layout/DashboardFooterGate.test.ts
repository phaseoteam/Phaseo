import { shouldShowDashboardFooter } from "./DashboardFooterGate";

describe("shouldShowDashboardFooter", () => {
	it.each([
		"/chat",
		"/chat/fusion",
		"/chat/image/session-1",
		"/settings",
		"/settings/usage/logs/requests",
		"/settings/usage/logs/upstream",
	])(
		"keeps the dashboard footer out of %s",
		(pathname) => {
			expect(shouldShowDashboardFooter(pathname)).toBe(false);
		},
	);

	it.each(["/", "/models", "/chats"])(
		"keeps the dashboard footer on %s",
		(pathname) => {
			expect(shouldShowDashboardFooter(pathname)).toBe(true);
		},
	);
});
