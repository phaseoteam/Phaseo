import { describe, expect, it } from "vitest";
import { signSlackRequest, verifySlackSignature } from "../src/signature";

// Slack's published example (docs.slack.dev, "Verifying requests from Slack").
const DOC_SECRET = "8f742231b10e8888abcd99yyyzzz85a5";
const DOC_TIMESTAMP = "1531420618";
const DOC_BODY = "token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c";
const DOC_SIGNATURE = "v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503";
const DOC_NOW = Number(DOC_TIMESTAMP) * 1000;

describe("Slack request signatures", () => {
	it("accepts Slack's documented example", async () => {
		await expect(verifySlackSignature({ signingSecret: DOC_SECRET, timestamp: DOC_TIMESTAMP, signature: DOC_SIGNATURE, body: DOC_BODY, now: DOC_NOW })).resolves.toBe("ok");
		await expect(signSlackRequest(DOC_SECRET, Number(DOC_TIMESTAMP), DOC_BODY)).resolves.toBe(DOC_SIGNATURE);
	});

	it("refuses a changed body, another secret or a changed signature", async () => {
		const base = { signingSecret: DOC_SECRET, timestamp: DOC_TIMESTAMP, signature: DOC_SIGNATURE, body: DOC_BODY, now: DOC_NOW };
		await expect(verifySlackSignature({ ...base, body: `${DOC_BODY}&x=1` })).resolves.toBe("bad_signature");
		await expect(verifySlackSignature({ ...base, signingSecret: "another-secret" })).resolves.toBe("bad_signature");
		await expect(verifySlackSignature({ ...base, signature: `${DOC_SIGNATURE.slice(0, -1)}0` })).resolves.toBe("bad_signature");
		// The timestamp is signed too: moving it breaks the signature.
		await expect(verifySlackSignature({ ...base, timestamp: "1531420619" })).resolves.toBe("bad_signature");
	});

	it("refuses requests more than five minutes old or ahead (replays)", async () => {
		const base = { signingSecret: DOC_SECRET, timestamp: DOC_TIMESTAMP, signature: DOC_SIGNATURE, body: DOC_BODY };
		await expect(verifySlackSignature({ ...base, now: DOC_NOW + 300_000 })).resolves.toBe("ok");
		await expect(verifySlackSignature({ ...base, now: DOC_NOW + 301_000 })).resolves.toBe("stale");
		await expect(verifySlackSignature({ ...base, now: DOC_NOW - 301_000 })).resolves.toBe("stale");
		// A replay a day later, with the original headers.
		await expect(verifySlackSignature({ ...base, now: DOC_NOW + 86_400_000 })).resolves.toBe("stale");
	});

	it("refuses missing or malformed headers and an empty secret", async () => {
		const base = { signingSecret: DOC_SECRET, timestamp: DOC_TIMESTAMP, signature: DOC_SIGNATURE, body: DOC_BODY, now: DOC_NOW };
		for (const change of [
			{ timestamp: null },
			{ timestamp: "abc" },
			{ timestamp: "-1531420618" },
			{ signature: undefined },
			{ signature: "v1=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503" },
			{ signature: "v0=a2114d57" },
			{ signature: `v0=${"z".repeat(64)}` },
			{ signingSecret: "" },
		]) {
			await expect(verifySlackSignature({ ...base, ...change })).resolves.toBe("missing");
		}
	});

	it("accepts an upper-case hex signature", async () => {
		await expect(verifySlackSignature({ signingSecret: DOC_SECRET, timestamp: DOC_TIMESTAMP, signature: DOC_SIGNATURE.toUpperCase().replace("V0=", "v0="), body: DOC_BODY, now: DOC_NOW })).resolves.toBe("ok");
	});
});
