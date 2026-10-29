import type { SlackClient } from "./slack-api";

// Streams an answer into Slack with chat.startStream / chat.appendStream, sending
// text in batches about every 400 ms, and finishes it with chat.stopStream.
//
// Writing to Slack is kept apart from writing the answer: a Slack call that fails
// while the model is still answering only stops the live stream. The model keeps
// going, the whole text is staged in the thread's coordinator, and the turn's
// reply step (which Workflows retries on its own) delivers it: it finishes the
// stream, or replaces the message's text, or posts the message when the stream
// never started. So a Slack failure never pays for the answer twice.
//
// Workflow steps can run twice, so a reply must never be posted twice. The reply's
// ts is stored (in the thread's coordinator) as soon as Slack returns it. A retried
// run finds it and writes nothing while it runs; the reply step then replaces that
// message's text with the new answer (stop the stream, then chat.update, since
// Slack refuses to edit a message that is still streaming).

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
	/** A Slack write failed: the rest is kept here for the reply step instead of being streamed. */
	failure: string | null = null;
	private pending = "";
	private lastSent = 0;
	private truncated = false;
	/** A retry: the earlier attempt's message is replaced by the reply step once this attempt is done. */
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

	/**
	 * Whether this attempt writes live: it isn't a retry and no Slack write has
	 * failed. After close, whether the live message shows the whole text;
	 * otherwise the reply step writes it.
	 */
	get streaming(): boolean {
		return !this.replacing && this.failure === null;
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
		if (this.streaming && this.options.now() - this.lastSent >= STREAM_BATCH_MS) await this.send();
	}

	/** Sends anything buffered (between steps, and at the end). */
	async flush(): Promise<void> {
		if (this.streaming && this.pending) await this.send();
	}

	private async send(): Promise<void> {
		const { slack, target } = this.options;
		const text = this.pending;
		this.pending = "";
		this.lastSent = this.options.now();
		for (const piece of pieces(text)) {
			if (this.stoppedByUser || this.failure) return;
			if (this.ts === null) {
				const started = await slack.call<{ ts?: string }>("chat.startStream", {
					channel: target.channel,
					thread_ts: target.threadTs,
					markdown_text: piece,
					...(isDirectMessage(target.channel) ? {} : { recipient_user_id: target.recipientUserId, ...(target.recipientTeamId ? { recipient_team_id: target.recipientTeamId } : {}) }),
				});
				if (started.ok === false || typeof started.data.ts !== "string") {
					this.failure = `startStream_${started.ok === false ? started.error : "ts_missing"}`;
					return;
				}
				this.ts = started.data.ts;
				await this.options.onStarted(this.ts);
			} else {
				const appended = await slack.call("chat.appendStream", { channel: target.channel, ts: this.ts, markdown_text: piece });
				if (appended.ok === false) {
					if (appended.error === "stopped_by_user" || appended.error === "message_not_in_streaming_state") {
						this.stoppedByUser = true;
						return;
					}
					this.failure = `appendStream_${appended.error}`;
					return;
				}
			}
		}
	}

	/** Ends this attempt's live writing. What is left (a retry, or a failed write) is the reply step's. */
	async close(): Promise<void> {
		await this.flush();
	}
}

/** A model in the footer: its display name, and its Phaseo model page when it is a catalogue model. */
export type FooterModel = { name: string; url: string | null };

/**
 * The small grey line under an answer: the model and what the turn cost.
 * `answeredBy` (the model Auto picked) is only shown when it differs from
 * `model`. `others`: the other models the answer used (asked with ask_model, or
 * compared), each after a +. `logsUrl` links the cost to the answer's requests in
 * Phaseo Logs.
 */
export type Footer = { model: FooterModel; answeredBy: FooterModel | null; others?: FooterModel[]; costNanos: number; logsUrl: string | null };

/** Slack's mrkdwn (a context block's text) reads &, < and > as markup. */
function mrkdwnLink(text: string, url: string | null): string {
	const shown = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	return url ? `<${url}|${shown}>` : shown;
}

/** markdown_text: the footer is in italics, so markup characters in a name are escaped; a link's URL keeps no parentheses. */
export function markdownLink(text: string, url: string | null): string {
	const shown = text.replace(/[\\`*_[\]]/g, "\\$&");
	return url ? `[${shown}](${url.replace(/\(/g, "%28").replace(/\)/g, "%29")})` : shown;
}

/** A cost as the footer shows it: four decimals under a dollar. */
export function costText(nanos: number): string {
	const dollars = nanos / 1_000_000_000;
	return `$${dollars < 1 ? dollars.toFixed(4) : dollars.toFixed(2)}`;
}

/** The footer as mrkdwn (a context block, under a stopped stream) or markdown (in a message's markdown_text). */
export function footerText(footer: Footer, format: "mrkdwn" | "markdown" = "mrkdwn"): string {
	const link = format === "mrkdwn" ? mrkdwnLink : markdownLink;
	const cost = link(costText(footer.costNanos), footer.logsUrl);
	const chosen = link(footer.model.name, footer.model.url);
	const answeredBy = footer.answeredBy && footer.answeredBy.name !== footer.model.name ? footer.answeredBy : null;
	const shown = new Set([footer.model.name, answeredBy?.name]);
	const others = (footer.others ?? []).filter((other) => !shown.has(other.name) && shown.add(other.name));
	const model = [answeredBy ? `${chosen} → ${link(answeredBy.name, answeredBy.url)}` : chosen, ...others.map((other) => link(other.name, other.url))].join(" + ");
	return `${model} · ${cost}`;
}

/** The whole reply as one message: blocks aren't allowed with markdown_text, so the footer is italic text. */
function wholeReply(text: string, footer: Footer | null): string {
	const footerLine = footer ? `\n\n_${footerText(footer, "markdown")}_` : "";
	return `${truncateMarkdown(text, MAX_MARKDOWN_CHARS - footerLine.length)}${footerLine}`;
}

async function updateReply(slack: SlackClient, args: { channel: string; ts: string; text: string; footer: Footer | null }): Promise<void> {
	const updated = await slack.call("chat.update", { channel: args.channel, ts: args.ts, markdown_text: wholeReply(args.text, args.footer) });
	if (updated.ok === false) throw new SlackPostError("update", updated.error);
}

/**
 * Stops the stream, with any closing text and the footer under it. When the
 * stream has already stopped (the person pressed stop, or an earlier try of this
 * step stopped it), they are added with an update instead, and a failed update
 * throws so the step retries. Safe to repeat. Returns whether the stream was
 * stopped here (which also sets the session back to active).
 */
export async function finishReply(slack: SlackClient, args: { channel: string; ts: string; text: string; footer: Footer | null; closingText?: string | null }): Promise<boolean> {
	const blocks = args.footer ? [{ type: "context", elements: [{ type: "mrkdwn", text: footerText(args.footer) }] }] : undefined;
	const stopped = await slack.call("chat.stopStream", {
		channel: args.channel,
		ts: args.ts,
		...(args.closingText ? { markdown_text: args.closingText } : {}),
		...(blocks ? { blocks } : {}),
	});
	if (stopped.ok) return true;
	const body = `${args.text}${args.closingText ?? ""}`;
	if (!body || (!args.footer && !args.closingText)) return false;
	await updateReply(slack, { channel: args.channel, ts: args.ts, text: body, footer: args.footer });
	return false;
}

/**
 * Replaces a reply's text with the whole staged answer: a retried run's new
 * answer, or the rest of one whose live stream failed. The stream is stopped
 * first, since Slack won't edit a message that is still streaming. Throws so the
 * step retries; safe to repeat. Returns whether the stream was stopped here.
 */
export async function replaceReply(slack: SlackClient, args: { channel: string; ts: string; text: string; footer: Footer | null }): Promise<boolean> {
	const stopped = await slack.call("chat.stopStream", { channel: args.channel, ts: args.ts });
	if (args.text) await updateReply(slack, args);
	return stopped.ok;
}

/** Posts the whole answer as a new message, when its stream never started. Throws so the step retries. */
export async function postReply(slack: SlackClient, args: { channel: string; threadTs: string; text: string; footer: Footer | null }): Promise<string> {
	const posted = await slack.call<{ ts?: string }>("chat.postMessage", { channel: args.channel, thread_ts: args.threadTs, markdown_text: wholeReply(args.text, args.footer) });
	if (posted.ok === false || typeof posted.data.ts !== "string") throw new SlackPostError("postMessage", posted.ok === false ? posted.error : "ts_missing");
	return posted.data.ts;
}
