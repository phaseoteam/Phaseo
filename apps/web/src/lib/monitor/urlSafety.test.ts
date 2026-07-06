import { normalizeMonitorHistoryLinkHref } from "./urlSafety";

describe("normalizeMonitorHistoryLinkHref", () => {
	it("allows HTTP and HTTPS monitor history links", () => {
		expect(normalizeMonitorHistoryLinkHref("https://example.com/path")).toBe(
			"https://example.com/path",
		);
		expect(normalizeMonitorHistoryLinkHref(" http://example.com/path ")).toBe(
			"http://example.com/path",
		);
	});

	it("rejects scriptable or non-web URL schemes", () => {
		expect(normalizeMonitorHistoryLinkHref("javascript:alert(1)")).toBeNull();
		expect(normalizeMonitorHistoryLinkHref("data:text/html,<script>alert(1)</script>")).toBeNull();
		expect(normalizeMonitorHistoryLinkHref("/relative/path")).toBeNull();
	});
});
