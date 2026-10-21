import type { SlackClient } from "./slack-api";

// Streams an answer into Slack with chat.startStream / chat.appendStream, sending
// text in batches about every 400 ms, and finishes it with chat.stopStream.
//
// Workflow steps can run twice, so a reply must never be posted twice. The reply's
// ts is stored (in the thread's coordinator) as soon as Slack returns it. A retried
// run finds it, writes nothing while it runs, and then replaces that message's text
// with the new answer (stop the stream, then chat.update, since Slack refuses to
// edit a message that is still streaming).

export const STREAM_BATCH_MS = 400;
/** Slack's limit for markdown_text in one call. */
export const MAX_MARKDOWN_CHARS = 12_000;
/** Slack messages hold about 40,000 characters; stay under it. */
export const MAX_REPLY_CHARS = 38_000;
const TRUNCATED_NOTE = "\n\n_The answer was cut short because it was too long for one Slack message._";

export class SlackPostError extends Error {
	constructor(readonly method: string, readonly code: string) {
		super(`slack_${method}_${code}`);
	}
}

export type ReplyTarget = {
	channel: string;
	threadTs: string;
	/** Slack needs the person and their team when streaming into a channel (not a DM). */
	recipientUserId: string;
	recipientTeamId: string | null;
};

function isDirectMessage(channel: string): boolean {
	return channel.startsWith("D");
}

function pieces(text: string): string[] {
	const out: string[] = [];
	for (let index = 0; index < text.length; index += MAX_MARKDOWN_CHARS) out.push(text.slice(index, index + MAX_MARKDOWN_CHARS));
	return out;
}

export function truncateMarkdown(text: string, limit = MAX_MARKDOWN_CHARS): string {
	return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

export class SlackReplyStream {
	/** The reply message, once there is one. */
	ts: string | null;
	/** Everything the reply shows, for the thread's working memory. */
	text = "";
	/** The person pressed Slack's stop button: no more text is accepted. */
	stoppedByUser = false;
	private pending = "";
	private lastSent = 0;
	private truncated = false;
	/** A retry: the earlier attempt's message is replaced once this attempt is done. */
	private readonly replacing: boolean;

	constructor(private readonly options: {
		slack: SlackClient;
		target: ReplyTarget;
		existingTs: string | null;
		onStarted: (ts: string) => Promise<void>;
		now: () => number;
	}) {
		this.ts = options.existingTs;
		this.replacing = options.existingTs !== null;
	}

	/** Adds text; sends what is buffered once 400 ms have passed since the last send. */
	async push(delta: string): Promise<void> {
		if (!delta || this.stoppedByUser || this.truncated) return;
		let accepted = delta;
		if (this.text.length + delta.length > MAX_REPLY_CHARS) {
			accepted = delta.slice(0, Math.max(0, MAX_REPLY_CHARS - this.text.length)) + TRUNCATED_NOTE;
			this.truncated = true;
		}
		this.text += accepted;
		this.pending += accepted;
		if (!this.replacing && this.options.now() - this.lastSent >= STREAM_BATCH_MS) await this.send();
	}

	/** Sends anything buffered (between steps, and at the end). */
	async flush(): Promise<void> {
		if (!this.replacing && this.pending) await this.send();
	}

	private async send(): Promise<void> {
		const { slack, target } = this.options;
		const text = this.pending;
		this.pending = "";
		this.lastSent = this.options.now();
		for (const piece of pieces(text)) {
			if (this.stoppedByUser) return;
			if (this.ts === null) {
				const started = await slack.call<{ ts?: string }>("chat.startStream", {
					channel: target.channel,
					thread_ts: target.threadTs,
					markdown_text: piece,
					...(isDirectMessage(target.channel) ? {} : { recipient_user_id: target.recipientUserId, ...(target.recipientTeamId ? { recipient_team_id: target.recipientTeamId } : {}) }),
				});
				if (started.ok === false || typeof started.data.ts !== "string") throw new SlackPostError("startStream", started.ok === false ? started.error : "ts_missing");
				this.ts = started.data.ts;
				await this.options.onStarted(this.ts);
			} else {
				const appended = await slack.call("chat.appendStream", { channel: target.channel, ts: this.ts, markdown_text: piece });
				if (appended.ok === false) {
					if (appended.error === "stopped_by_user" || appended.error === "message_not_in_streaming_state") {
						this.stoppedByUser = true;
						return;
					}
					throw new SlackPostError("appendStream", appended.error);
				}
			}
		}
	}

	/** Ends this attempt's writing: sends the rest, or on a retry replaces the earlier message. */
	async close(): Promise<void> {
		if (!this.replacing) return this.flush();
		if (this.ts === null || !this.text) return;
		const { slack, target } = this.options;
		await slack.call("chat.stopStream", { channel: target.channel, ts: this.ts });
		const updated = await slack.call("chat.update", { channel: target.channel, ts: this.ts, markdown_text: truncateMarkdown(this.text) });
		if (updated.ok === false) throw new SlackPostError("update", updated.error);
	}
}

/** The small grey line under an answer: the model and what the turn cost. */
export function footerText(args: { model: string; answeredBy: string | null; costNanos: number }): string {
	const dollars = args.costNanos / 1_000_000_000;
	const cost = `$${dollars < 1 ? dollars.toFixed(4) : dollars.toFixed(2)}`;
	const model = args.answeredBy && args.answeredBy !== args.model ? `${args.model} → ${args.answeredBy}` : args.model;
	return `${model} · ${cost}`;
}

/**
 * Stops the stream, with any closing text and the footer under it. When the
 * stream has already stopped (a retry replaced the message, or the person pressed
 * stop), they are added with an update instead. Safe to repeat. Returns whether
 * the stream was stopped here (which also sets the session back to active).
 */
export async function finishReply(slack: SlackClient, args: { channel: string; ts: string; text: string; footer: string | null; closingText?: string | null }): Promise<boolean> {
	const blocks = args.footer ? [{ type: "context", elements: [{ type: "mrkdwn", text: args.footer }] }] : undefined;
	const stopped = await slack.call("chat.stopStream", {
		channel: args.channel,
		ts: args.ts,
		...(args.closingText ? { markdown_text: args.closingText } : {}),
		...(blocks ? { blocks } : {}),
	});
	if (stopped.ok) return true;
	const body = `${args.text}${args.closingText ?? ""}`;
	if (!body || (!args.footer && !args.closingText)) return false;
	const footer = args.footer ? `\n\n_${args.footer}_` : "";
	await slack.call("chat.update", { channel: args.channel, ts: args.ts, markdown_text: `${truncateMarkdown(body, MAX_MARKDOWN_CHARS - footer.length)}${footer}` });
	return false;
}
