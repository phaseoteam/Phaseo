import type { Installation } from "./installations";
import type { Db } from "./supabase";

// Choosing a model per message. When an admin turns model choice on, a message
// that starts with `with <model>:` is answered by that model, and the prefix is
// taken off the prompt. <model> is one of the installation's allowed models: its
// id or catalogue name, or the start of either when only one allowed model has
// it, ignoring case. Nothing outside the allowlist is ever matched.
//
// A message that names a model that isn't allowed, or that fits more than one,
// gets a private reply listing the choices and isn't answered (events.ts checks
// this before the meter counts the person or the answer).

export const AUTO_MODEL = "phaseo/auto";
const AUTO_NAME = "Auto";
/** The most models an admin may allow; web-api checks the same. */
export const MAX_ALLOWED_MODELS = 10;
/** How far into a message the colon after `with <model>` may be. */
const MAX_NAMED_CHARS = 100;
const PREFIX = /^with\s/i;

export type AllowedModel = { id: string; name: string };

export type ModelChoice =
	/** No `with <model>:`: the installation's model answers the whole message. */
	| { kind: "none" }
	| { kind: "chosen"; model: AllowedModel; prompt: string }
	| { kind: "not_allowed"; named: string }
	| { kind: "ambiguous"; named: string; matches: AllowedModel[] };

export type Refusal = Extract<ModelChoice, { kind: "not_allowed" | "ambiguous" }>;

/** The message without the agent's own mention, as the model reads it. */
export function withoutMention(text: string, botUserId: string): string {
	return text.split(`<@${botUserId}>`).join("").trim();
}

/** Whether people may choose a model per message here: switched on, with at least one model allowed. */
export function modelChoiceOn(installation: Pick<Installation, "model_choice_enabled" | "allowed_models">): boolean {
	return installation.model_choice_enabled === true && (installation.allowed_models?.length ?? 0) > 0;
}

const FORMATTING = new Set([" ", "\t", "*", "_", "~", "`"]);

/** Trims Slack's formatting marks (bold, italics, strike, code) and spaces from both ends. A loop, not a regular expression. */
function trimFormatting(text: string): string {
	let start = 0;
	let end = text.length;
	while (start < end && FORMATTING.has(text[start])) start += 1;
	while (end > start && FORMATTING.has(text[end - 1])) end -= 1;
	return text.slice(start, end);
}

/** Slack sends &, < and > in message text as &amp;, &lt; and &gt;. */
function unescapeText(text: string): string {
	return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** A name as typed, compared without case, extra spaces or Slack's markup: <url|label> links and its escapes. */
function comparable(text: string): string {
	const unlinked = unescapeText(text.replace(/<[^<>|]*\|([^<>]*)>/g, "$1").replace(/<([^<>]*)>/g, "$1"));
	return trimFormatting(unlinked).split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

type Reading = { named: string; key: string; prompt: string };

/**
 * Each way to read `with <model>: <prompt>`, the longest model text first: a
 * catalogue name can hold a colon itself, such as "Amazon: Nova Pro 1.0". The
 * model text is on the first line and at most MAX_NAMED_CHARS long.
 */
function readings(text: string): Reading[] {
	if (!PREFIX.test(text)) return [];
	const body = text.slice(4);
	const found: Reading[] = [];
	for (let index = 0; index < body.length && index <= MAX_NAMED_CHARS; index += 1) {
		if (body[index] === "\n") break;
		if (body[index] !== ":") continue;
		const named = body.slice(0, index).trim();
		const key = comparable(named);
		if (key) found.push({ named, key, prompt: body.slice(index + 1).trim() });
	}
	return found.reverse();
}

/** Whether a message starts with `with <something>:`, so the allowed models' names are worth reading. */
export function namesModel(text: string): boolean {
	return readings(text).length > 0;
}

/**
 * The model a message chooses, matched only against `allowed`: first an exact
 * id or name, then the start of one, trying the longest reading first.
 */
export function chooseModel(text: string, allowed: AllowedModel[]): ModelChoice {
	const options = readings(text);
	if (!options.length) return { kind: "none" };
	const keyed = allowed.map((model) => ({ model, id: comparable(model.id), name: comparable(model.name) }));
	const pick = (option: Reading, fits: (entry: (typeof keyed)[number]) => boolean): ModelChoice | null => {
		const matches = [...new Map(keyed.filter(fits).map((entry) => [entry.model.id, entry.model])).values()];
		if (matches.length === 1) return { kind: "chosen", model: matches[0], prompt: option.prompt };
		if (matches.length > 1) return { kind: "ambiguous", named: option.named, matches };
		return null;
	};
	for (const option of options) {
		const exact = pick(option, (entry) => entry.id === option.key || entry.name === option.key);
		if (exact) return exact;
	}
	for (const option of options) {
		const started = pick(option, (entry) => entry.id.startsWith(option.key) || entry.name.startsWith(option.key));
		if (started) return started;
	}
	// What they most likely meant to name: the text before the first colon.
	return { kind: "not_allowed", named: options[options.length - 1].named };
}

/** A PostgREST in.() list, every value quoted. */
function inList(values: string[]): string {
	return `in.(${values.map((value) => `"${value.replace(/["\\]/g, "\\$&")}"`).join(",")})`;
}

/**
 * Catalogue names for model ids. Auto is named Auto; a model the catalogue
 * doesn't name (or a catalogue that can't be read) keeps its id.
 */
export async function modelNames(db: Db, ids: string[]): Promise<Map<string, string>> {
	const wanted = [...new Set(ids)].filter((id) => id !== AUTO_MODEL);
	const rows = wanted.length
		? await db.select<{ model_slug: string; name: string | null }>("v2_models", { select: "model_slug,name", model_slug: inList(wanted) }).catch(() => [])
		: [];
	const names = new Map(rows.map((row) => [row.model_slug, row.name?.trim() || row.model_slug]));
	return new Map(ids.map((id) => [id, id === AUTO_MODEL ? AUTO_NAME : names.get(id) ?? id]));
}

/** The installation's allowed models with their names, in the admins' order. */
export function allowedModels(installation: Pick<Installation, "allowed_models">, names: Map<string, string>): AllowedModel[] {
	return [...new Set(installation.allowed_models ?? [])].slice(0, MAX_ALLOWED_MODELS).map((id) => ({ id, name: names.get(id) ?? id }));
}

/** Text for Slack's mrkdwn, which reads &, < and > as markup. */
function escapeText(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function listed(model: AllowedModel): string {
	return model.name === model.id ? `\`${model.id}\`` : `${escapeText(model.name)} (\`${model.id}\`)`;
}

/** The private reply to a message whose model can't be used: the models to choose from, and what happens without one. */
export function modelRefusalText(choice: Refusal, allowed: AllowedModel[], defaultName: string): string {
	// As Slack sent it (escaped already), and at most MAX_NAMED_CHARS long.
	const named = `“${escapeText(unescapeText(choice.named))}”`;
	const opening = choice.kind === "ambiguous"
		? `${named} could be more than one of the models you can choose (${choice.matches.map((model) => escapeText(model.name)).join(", ")}), so I didn't answer. Name one of them.`
		: `${named} isn't one of the models you can choose here, so I didn't answer.`;
	// Slack reads a bare <model> as a link, so it is escaped too.
	return [
		opening,
		"",
		`Start your message with \`with &lt;model&gt;:\` and one of these, for example \`with ${escapeText(allowed[0]?.name ?? "<model>")}: …\`:`,
		...allowed.map((model) => `• ${listed(model)}`),
		"",
		`Without \`with …:\`, I answer with ${escapeText(defaultName)}.`,
	].join("\n");
}
