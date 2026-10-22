import { describe, expect, it } from "vitest";
import { compareTs, KNOWN_IN_READ, LOOKBACK_SECONDS, readWindow, REPLIES_LIMIT, threadRead } from "../src/history";
import { BOT_USER_ID } from "./fakes";

const ts = (seconds: number) => `${seconds}.000100`;
const ROOT = ts(1_792_590_000);

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
		}, window, turn, BOT_USER_ID);
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
		expect(threadRead({ messages: [message(1_792_590_000), ...page], has_more: true }, window, turn, BOT_USER_ID).context.partial).toBe(true);
		expect(threadRead({ messages: [message(1_792_590_000), ...page] }, window, turn, BOT_USER_ID).context.partial).toBe(true);
		expect(threadRead({ messages: [message(1_792_590_000), ...page.slice(1)] }, window, turn, BOT_USER_ID).context.partial).toBe(false);
		// From the root, the first message is one of the messages read.
		expect(threadRead({ messages: [message(1_792_590_000)], has_more: false }, window, turn, BOT_USER_ID).context).toMatchObject({ root: null, messages: [{ ts: ROOT }] });
	});
});
