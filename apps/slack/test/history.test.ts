import { describe, expect, it } from "vitest";
import { compareTs, KNOWN_IN_READ, LOOKBACK_SECONDS, readWindow, REPLIES_LIMIT, threadRead } from "../src/history";
import { BOT_USER_ID, HOSTED_APP_ID } from "./fakes";

const ts = (seconds: number) => `${seconds}.000100`;
const ROOT = ts(1_792_590_000);
const SELF = { botUserId: BOT_USER_ID, appId: HOSTED_APP_ID };

describe("compareTs", () => {
	it("orders by seconds, then by the fraction, whatever its length", () => {
		expect(["1792600000.000100", "1792599999.999999", "1792600000.0001", "1792600000.00005"].sort(compareTs))
			.toEqual(["1792599999.999999", "1792600000.00005", "1792600000.000100", "1792600000.0001"]);
		expect(compareTs("1792600000.0001", "1792600000.000100")).toBe(0);
	});
});

describe("readWindow", () => {
	const at = (seconds: number, kind: "mention" | "dm" = "mention") => ({ threadTs: ROOT, messageTs: ts(1_792_590_000 + seconds), kind });

	it("reads a thread it doesn't know from 30 minutes back, or from its first message when that is later", () => {
		expect(LOOKBACK_SECONDS).toBe(1_800);
		expect(readWindow([], at(10 * 60))).toEqual({ oldest: ROOT, fromRoot: true });
		expect(readWindow([], at(3 * 60 * 60))).toEqual({ oldest: ts(1_792_590_000 + 3 * 60 * 60 - 1_800), fromRoot: false });
		expect(readWindow([], at(3 * 60 * 60, "dm"))).toEqual({ oldest: ts(1_792_590_000 + 3 * 60 * 60 - 1_800), fromRoot: false });
	});

	it("starts at the oldest of the newest known messages, leaving room for the ones written since", () => {
		expect(KNOWN_IN_READ).toBeLessThan(REPLIES_LIMIT);
		const known = Array.from({ length: 12 }, (_, index) => ts(1_792_590_000 + index * 60));
		// A DM: the 8 newest known before the message, however old.
		expect(readWindow(known, at(60 * 60, "dm"))).toEqual({ oldest: known[4], fromRoot: false });
		// While it knows fewer than that, the whole thread.
		expect(readWindow(known.slice(0, 5), at(60 * 60, "dm"))).toEqual({ oldest: ROOT, fromRoot: true });
		// Known messages after the one answered (replies to earlier turns) don't count.
		expect(readWindow(known, at(5 * 60 + 30, "dm"))).toEqual({ oldest: ROOT, fromRoot: true });
	});

	it("in a channel, never reads further back than 30 minutes", () => {
		const known = Array.from({ length: 12 }, (_, index) => ts(1_792_590_000 + index * 60));
		expect(readWindow(known, at(15 * 60))).toEqual({ oldest: known[4], fromRoot: false });
		expect(readWindow(known, at(2 * 60 * 60))).toEqual({ oldest: ts(1_792_590_000 + 2 * 60 * 60 - 1_800), fromRoot: false });
	});
});

describe("threadRead", () => {
	const turn = { threadTs: ROOT, messageTs: ts(1_792_590_900) };
	const message = (seconds: number, extra: Record<string, unknown> = {}) => ({ ts: ts(seconds), user: "U0PERSON02", text: `at ${seconds}`, ...extra });

	it("keeps the thread's first message apart when it falls before the read, and drops the one answered", () => {
		const window = { oldest: ts(1_792_590_600), fromRoot: false };
		const read = threadRead({
			messages: [message(1_792_590_000), message(1_792_590_700), message(1_792_590_600, { bot_id: "B0BOT00001", user: BOT_USER_ID }), message(1_792_590_900, { user: "U0PERSON01" })],
			has_more: false,
		}, window, turn, SELF);
		expect(read).toEqual({
			context: {
				root: { role: "user", author: "U0PERSON02", text: "at 1792590000", ts: ROOT },
				messages: [
					{ role: "assistant", author: null, text: "at 1792590600", ts: ts(1_792_590_600) },
					{ role: "user", author: "U0PERSON02", text: "at 1792590700", ts: ts(1_792_590_700) },
				],
				fromRoot: false,
				partial: false,
			},
			ts: [ts(1_792_590_600), ts(1_792_590_700), ts(1_792_590_900)],
		});
	});

	it("is partial when Slack says more is left, or sends a full page without saying", () => {
		const window = { oldest: ROOT, fromRoot: true };
		const page = Array.from({ length: REPLIES_LIMIT }, (_, index) => message(1_792_590_001 + index));
		expect(threadRead({ messages: [message(1_792_590_000), ...page], has_more: true }, window, turn, SELF).context.partial).toBe(true);
		expect(threadRead({ messages: [message(1_792_590_000), ...page] }, window, turn, SELF).context.partial).toBe(true);
		expect(threadRead({ messages: [message(1_792_590_000), ...page.slice(1)] }, window, turn, SELF).context.partial).toBe(false);
		// From the root, the first message is one of the messages read.
		expect(threadRead({ messages: [message(1_792_590_000)], has_more: false }, window, turn, SELF).context).toMatchObject({ root: null, messages: [{ ts: ROOT }] });
	});

	it("takes only the agent's own bot user or app as itself, and labels other bots and apps", () => {
		const window = { oldest: ROOT, fromRoot: true };
		const read = threadRead({
			messages: [
				message(1_792_590_000, { user: "U0PERSON01" }),
				// The agent's reply, posted with its bot token.
				message(1_792_590_100, { user: BOT_USER_ID, bot_id: "B0BOT00001", app_id: HOSTED_APP_ID, bot_profile: { app_id: HOSTED_APP_ID, name: "Phaseo" } }),
				// Another app's bot user.
				message(1_792_590_200, { user: "U0OTHERBOT", bot_id: "B0OTHER001", app_id: "A0OTHER001", bot_profile: { app_id: "A0OTHER001", name: "Deploy\n  Bot" } }),
				// An incoming webhook: no user, only the name it posted under.
				message(1_792_590_300, { user: undefined, subtype: "bot_message", bot_id: "B0HOOK0001", username: "CI alerts" }),
				// A workflow with no name, and a message from the agent's own app without its bot user.
				message(1_792_590_400, { user: undefined, subtype: "bot_message", bot_id: "B0FLOW0001" }),
				message(1_792_590_500, { user: undefined, bot_id: "B0BOT00001", bot_profile: { app_id: HOSTED_APP_ID, name: "Phaseo" } }),
				message(1_792_590_600, { user: "U0PERSON02" }),
			],
			has_more: false,
		}, window, turn, SELF);
		expect(read.context.messages.map(({ role, author, name }) => ({ role, author, name }))).toEqual([
			{ role: "user", author: "U0PERSON01", name: undefined },
			{ role: "assistant", author: null, name: undefined },
			{ role: "app", author: null, name: "Deploy Bot" },
			{ role: "app", author: null, name: "CI alerts" },
			{ role: "app", author: null, name: undefined },
			{ role: "assistant", author: null, name: undefined },
			{ role: "user", author: "U0PERSON02", name: undefined },
		]);
		// When the agent's app id isn't known, only its bot user is itself.
		const unknownApp = threadRead({ messages: [message(1_792_590_500, { user: undefined, bot_id: "B0BOT00001", bot_profile: { app_id: HOSTED_APP_ID } })], has_more: false }, window, turn, { botUserId: BOT_USER_ID, appId: null });
		expect(unknownApp.context.messages[0]).toMatchObject({ role: "app" });
	});

	it("keeps the files people shared by id and name, also on a message with no text", () => {
		const window = { oldest: ROOT, fromRoot: true };
		const read = threadRead({
			messages: [
				message(1_792_590_100, { text: "", subtype: "file_share", files: [{ id: "F0IMAGE001", name: "dashboard.png", url_private: "https://files.slack.com/x", mimetype: "image/png" }] }),
				message(1_792_590_200, { text: "", files: [] }),
				message(1_792_590_300, { files: [{ id: "F0PDF00001", title: "Invoice" }] }),
			],
			has_more: false,
		}, window, turn, SELF);
		expect(read.context.messages).toEqual([
			{ role: "user", author: "U0PERSON02", text: "", ts: ts(1_792_590_100), files: [{ id: "F0IMAGE001", name: "dashboard.png" }] },
			{ role: "user", author: "U0PERSON02", text: "at 1792590300", ts: ts(1_792_590_300), files: [{ id: "F0PDF00001", name: "Invoice" }] },
		]);
	});
});
