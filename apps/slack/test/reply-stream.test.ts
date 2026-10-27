import { beforeEach, describe, expect, it } from "vitest";
import { finishReply, footerText, MAX_REPLY_CHARS, postReply, replaceReply, SlackPostError, SlackReplyStream, STREAM_BATCH_MS, type Footer, type ReplyTarget } from "../src/reply-stream";
import { FakeSlack } from "./fakes";

const CHANNEL: ReplyTarget = { channel: "C0CHANNEL1", threadTs: "1792600000.000100", recipientUserId: "U0PERSON01", recipientTeamId: "T0TEST0001" };
const DM: ReplyTarget = { channel: "D0DIRECT01", threadTs: "1792600000.000200", recipientUserId: "U0PERSON01", recipientTeamId: "T0TEST0001" };

let slack: FakeSlack;
let clock: { now: number };
let started: string[];

function stream(target = CHANNEL, existingTs: string | null = null) {
	return new SlackReplyStream({ slack: slack.client("xoxb-1-test-token"), target, existingTs, onStarted: async (ts) => { started.push(ts); }, now: () => clock.now });
}

beforeEach(() => {
	slack = new FakeSlack();
	clock = { now: 1_000_000 };
	started = [];
});

describe("SlackReplyStream", () => {
	it("starts the reply at once, then sends text in batches about every 400 ms", async () => {
		const reply = stream();
		await reply.push("Hel");
		expect(slack.of("chat.startStream").map((call) => call.args)).toEqual([{
			channel: "C0CHANNEL1", thread_ts: "1792600000.000100", markdown_text: "Hel", recipient_user_id: "U0PERSON01", recipient_team_id: "T0TEST0001",
		}]);
		expect(started).toEqual(["1792600100.000001"]);
		for (const delta of ["lo", ", ", "wor"]) {
			clock.now += 100;
			await reply.push(delta);
		}
		expect(slack.of("chat.appendStream")).toHaveLength(0);
		clock.now += 100;
		await reply.push("ld");
		expect(slack.of("chat.appendStream").map((call) => call.args)).toEqual([{ channel: "C0CHANNEL1", ts: "1792600100.000001", markdown_text: "lo, world" }]);
		clock.now += STREAM_BATCH_MS - 1;
		await reply.push("!");
		await reply.close();
		expect(slack.of("chat.appendStream").map((call) => call.args.markdown_text)).toEqual(["lo, world", "!"]);
		expect(reply.text).toBe("Hello, world!");
		expect(slack.of("chat.startStream")).toHaveLength(1);
	});

	it("leaves out the channel recipient in a DM", async () => {
		const reply = stream(DM);
		await reply.push("Hi");
		expect(slack.of("chat.startStream")[0].args).toEqual({ channel: "D0DIRECT01", thread_ts: "1792600000.000200", markdown_text: "Hi" });
	});

	it("splits text over Slack's 12,000 character limit per call and cuts a reply that is too long", async () => {
		const reply = stream();
		await reply.push("a".repeat(30_000));
		expect(slack.of("chat.startStream")[0].args.markdown_text).toHaveLength(12_000);
		expect(slack.of("chat.appendStream").map((call) => String(call.args.markdown_text).length)).toEqual([12_000, 6_000]);
		clock.now += 1_000;
		await reply.push("b".repeat(20_000));
		await reply.push("never sent");
		await reply.close();
		expect(reply.text.length).toBeLessThan(MAX_REPLY_CHARS + 200);
		expect(reply.text).toMatch(/cut short because it was too long/);
		expect(reply.text).not.toContain("never sent");
	});

	it("stops writing when the person presses Slack's stop button", async () => {
		const reply = stream();
		await reply.push("Thinking");
		slack.failures.set("chat.appendStream", ["stopped_by_user"]);
		clock.now += 1_000;
		await reply.push(" more");
		expect(reply.stoppedByUser).toBe(true);
		clock.now += 1_000;
		await reply.push(" and more");
		expect(slack.of("chat.appendStream")).toHaveLength(1);
	});

	it("keeps the text and stops writing live when Slack refuses a post, so the model never runs again for it", async () => {
		const reply = stream();
		await reply.push("Hi");
		slack.failures.set("chat.appendStream", ["internal_error"]);
		clock.now += 1_000;
		await expect(reply.push(" there")).resolves.toBeUndefined();
		expect(reply.failure).toBe("appendStream_internal_error");
		clock.now += 1_000;
		await reply.push(", more");
		await reply.close();
		expect(slack.of("chat.appendStream")).toHaveLength(1);
		expect(reply.text).toBe("Hi there, more");
		expect(reply.streaming).toBe(false);

		const unstarted = stream();
		slack.failures.set("chat.startStream", ["internal_error"]);
		await unstarted.push("Hello");
		expect(unstarted).toMatchObject({ ts: null, failure: "startStream_internal_error", text: "Hello" });
		expect(unstarted.streaming).toBe(false);
	});

	it("on a retry, writes nothing while running, leaving the earlier message to the reply step", async () => {
		const reply = stream(CHANNEL, "1792600100.000009");
		await reply.push("A fresh ");
		clock.now += 1_000;
		await reply.push("answer");
		await reply.close();
		expect(slack.calls).toHaveLength(0);
		expect(reply).toMatchObject({ ts: "1792600100.000009", text: "A fresh answer" });
		expect(reply.streaming).toBe(false);
		expect(started).toEqual([]);
	});
});

/** A plain footer (Auto, nothing linked), and how each format writes it. */
const FOOTER: Footer = { model: { name: "Auto", url: null }, answeredBy: null, costNanos: 12_300_000, logsUrl: null };
const FOOTER_TEXT = "Auto · $0.0123";

describe("finishing a reply", () => {
	it("stops the stream with the footer under it", async () => {
		await expect(finishReply(slack.client("xoxb-1-test-token"), { channel: "C0CHANNEL1", ts: "1792600100.000001", text: "Answer", footer: FOOTER })).resolves.toBe(true);
		expect(slack.calls.map((call) => [call.method, call.args])).toEqual([
			["chat.stopStream", { channel: "C0CHANNEL1", ts: "1792600100.000001", blocks: [{ type: "context", elements: [{ type: "mrkdwn", text: FOOTER_TEXT }] }] }],
		]);
	});

	it("adds the footer with an update when the stream had already stopped, and is safe to repeat", async () => {
		slack.failures.set("chat.stopStream", ["message_not_in_streaming_state", "message_not_in_streaming_state"]);
		for (let attempt = 0; attempt < 2; attempt += 1) {
			await finishReply(slack.client("xoxb-1-test-token"), { channel: "C0CHANNEL1", ts: "1792600100.000001", text: "Answer", footer: FOOTER });
		}
		expect(slack.of("chat.update").map((call) => call.args.markdown_text)).toEqual([`Answer\n\n_${FOOTER_TEXT}_`, `Answer\n\n_${FOOTER_TEXT}_`]);
	});

	it("throws when that update fails, so the step retries instead of losing the footer", async () => {
		slack.failures.set("chat.stopStream", ["message_not_in_streaming_state"]);
		slack.failures.set("chat.update", ["internal_error"]);
		const args = { channel: "C0CHANNEL1", ts: "1792600100.000001", text: "Answer", footer: FOOTER };
		await expect(finishReply(slack.client("xoxb-1-test-token"), args)).rejects.toMatchObject({ method: "update", code: "internal_error" });
		await expect(finishReply(slack.client("xoxb-1-test-token"), args)).resolves.toBe(true);
	});

	it("replaces a message's text with the whole answer, stopping its stream first", async () => {
		const args = { channel: "C0CHANNEL1", ts: "1792600100.000009", text: "A fresh answer", footer: { ...FOOTER, costNanos: 1_000_000 } };
		await expect(replaceReply(slack.client("xoxb-1-test-token"), args)).resolves.toBe(true);
		expect(slack.calls.map((call) => [call.method, call.args])).toEqual([
			["chat.stopStream", { channel: "C0CHANNEL1", ts: "1792600100.000009" }],
			["chat.update", { channel: "C0CHANNEL1", ts: "1792600100.000009", markdown_text: "A fresh answer\n\n_Auto · $0.0010_" }],
		]);
		slack.failures.set("chat.update", ["ratelimited"]);
		await expect(replaceReply(slack.client("xoxb-1-test-token"), args)).rejects.toBeInstanceOf(SlackPostError);
	});

	it("posts the whole answer when its stream never started", async () => {
		const ts = await postReply(slack.client("xoxb-1-test-token"), { channel: "C0CHANNEL1", threadTs: "1792600000.000100", text: "Answer", footer: FOOTER });
		expect(ts).toBe("1792600100.000001");
		expect(slack.of("chat.postMessage")[0].args).toEqual({ channel: "C0CHANNEL1", thread_ts: "1792600000.000100", markdown_text: `Answer\n\n_${FOOTER_TEXT}_` });
		slack.failures.set("chat.postMessage", ["channel_not_found"]);
		await expect(postReply(slack.client("xoxb-1-test-token"), { channel: "C0CHANNEL1", threadTs: "1792600000.000100", text: "Answer", footer: null })).rejects.toBeInstanceOf(SlackPostError);
	});

	it("shows the model, the one Auto picked when it differs, and the cost in US dollars", () => {
		const gpt = { name: "GPT Test", url: null };
		expect(footerText({ ...FOOTER, answeredBy: gpt })).toBe("Auto → GPT Test · $0.0123");
		expect(footerText({ ...FOOTER, model: gpt, costNanos: 1_250_000_000 })).toBe("GPT Test · $1.25");
		expect(footerText({ ...FOOTER, answeredBy: { name: "Auto", url: null }, costNanos: 0 })).toBe("Auto · $0.0000");
	});

	it("links models to their pages and the cost to Logs, in either format", () => {
		const footer: Footer = {
			model: { name: "Auto", url: null },
			answeredBy: { name: "GPT_Test [beta] & co", url: "https://phaseo.app/models/openai/gpt-test(beta)" },
			costNanos: 12_300_000,
			logsUrl: "https://phaseo.app/settings/usage/logs/requests?session=slack-Ev0TEST0001",
		};
		// A context block: Slack's <url|text> links, with &, < and > escaped.
		expect(footerText(footer, "mrkdwn")).toBe("Auto → <https://phaseo.app/models/openai/gpt-test(beta)|GPT_Test [beta] &amp; co> · <https://phaseo.app/settings/usage/logs/requests?session=slack-Ev0TEST0001|$0.0123>");
		// markdown_text, where the footer is in italics: markup in names is escaped, and parentheses in URLs.
		expect(footerText(footer, "markdown")).toBe("Auto → [GPT\\_Test \\[beta\\] & co](https://phaseo.app/models/openai/gpt-test%28beta%29) · [$0.0123](https://phaseo.app/settings/usage/logs/requests?session=slack-Ev0TEST0001)");
	});
});
