import { readPosthogCookieIdentity } from "./posthogCookie";

const key = "phc_test";

function cookieFor(value: unknown): string {
	return `other=1; ph_${key}_posthog=${encodeURIComponent(JSON.stringify(value))}; theme=dark`;
}

describe("readPosthogCookieIdentity", () => {
	it("returns the distinct ID, session ID and identified state", () => {
		expect(
			readPosthogCookieIdentity(
				cookieFor({ distinct_id: "user-1", $sesid: [1, "session-1", 0], $user_state: "identified" }),
				key,
			),
		).toEqual({ distinctId: "user-1", sessionId: "session-1", identified: true });
	});

	it("treats anonymous visitors without a session as unidentified", () => {
		expect(
			readPosthogCookieIdentity(cookieFor({ distinct_id: "anon-1", $user_state: "anonymous" }), key),
		).toEqual({ distinctId: "anon-1", sessionId: null, identified: false });
	});

	it("ignores other projects, malformed values and missing keys", () => {
		expect(readPosthogCookieIdentity(cookieFor({ distinct_id: "user-1" }), "phc_other")).toBeNull();
		expect(readPosthogCookieIdentity(`ph_${key}_posthog=%7Bnot-json`, key)).toBeNull();
		expect(readPosthogCookieIdentity(cookieFor({ $sesid: [1, "s", 0] }), key)).toBeNull();
		expect(readPosthogCookieIdentity(cookieFor({ distinct_id: "user-1" }), undefined)).toBeNull();
		expect(readPosthogCookieIdentity(undefined, key)).toBeNull();
	});
});
