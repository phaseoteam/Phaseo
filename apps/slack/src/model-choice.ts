import type { Installation } from "./installations";
import type { Db } from "./supabase";

// Choosing a model per message. When an admin turns model choice on, a message
// that starts with `with <model>:` is answered by that model, and the prefix is
// taken off the prompt. <model> is one of the installation's allowed models: its
// id (with or without its lab) or catalogue name, or the start of either when
// only one allowed model has it, ignoring case. Nothing outside the allowlist is
// ever chosen.
//
// A message that names a catalogue model that isn't allowed, or that fits more
// than one allowed model, gets a private reply listing the choices and isn't
// answered (events.ts checks this before the meter counts the person or the
// answer). Text that names no model at all ("With regards to the invoice: …") is
// an ordinary message.
//
// A message that starts with `compare <model>, <model>[, <model>]: <question>`
// is answered by each of those allowed models (compare.ts), each named the same
// way, with the same refusals.

export const AUTO_MODEL = "phaseo/auto";
const AUTO_NAME = "Auto";
/** The most models an admin may allow; web-api checks the same. */
export const MAX_ALLOWED_MODELS = 10;
/** How far into a message the colon after `with <model>` may be. */
const MAX_NAMED_CHARS = 100;
const PREFIX = /^with\s/i;
const COMPARE_PREFIX = /^compare\s/i;
/** How many models a Compare asks. */
export const MIN_COMPARED = 2;
export const MAX_COMPARED = 3;
/** How far into a message the colon after `compare <models>` may be: three names and their commas. */
const MAX_COMPARED_CHARS = MAX_COMPARED * (MAX_NAMED_CHARS + 2);

export type AllowedModel = { id: string; name: string };

export type ModelChoice =
	/** No `with <model>:`: the installation's model answers the whole message. */
	| { kind: "none" }
	/**
	 * `longer`: the readings longer than the one that matched, longest first. One of
	 * them may name another catalogue model ("Amazon: Nova Lite 1.0" read as
	 * "Amazon"), which events.ts checks before using the choice. `exact`: whether the
	 * reading was a whole id or name rather than the start of one.
	 */
	| { kind: "chosen"; model: AllowedModel; prompt: string; longer: string[]; exact: boolean }
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
 * model text is on the first line and at most MAX_NAMED_CHARS long (`compare`
 * reads its list of models the same way).
 */
function readings(text: string, prefix = PREFIX, maxChars = MAX_NAMED_CHARS): Reading[] {
	if (!prefix.test(text)) return [];
	// The word only: the space after it is trimmed off each reading.
	const body = text.slice(prefix === PREFIX ? 4 : 7);
	const found: Reading[] = [];
	for (let index = 0; index < body.length && index <= maxChars; index += 1) {
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

/** Whether a message starts with `compare <something>:`, so the allowed models' names are worth reading. */
export function namesComparison(text: string): boolean {
	return readings(text, COMPARE_PREFIX, MAX_COMPARED_CHARS).length > 0;
}

type Keyed = { model: AllowedModel; id: string; short: string; name: string };

function keyedModels(allowed: AllowedModel[]): Keyed[] {
	// An id also matches without its lab: `gpt-6-luna` for `openai/gpt-6-luna`.
	return allowed.map((model) => ({ model, id: comparable(model.id), short: comparable(model.id.slice(model.id.indexOf("/") + 1)), name: comparable(model.name) }));
}

/** The allowed models a name fits: its whole id or name, or (`exact` false) the start of one. */
function fitting(keyed: Keyed[], key: string, exact: boolean): AllowedModel[] {
	const fits = exact
		? (entry: Keyed) => entry.id === key || entry.short === key || entry.name === key
		: (entry: Keyed) => entry.id.startsWith(key) || entry.short.startsWith(key) || entry.name.startsWith(key);
	return [...new Map(keyed.filter(fits).map((entry) => [entry.model.id, entry.model])).values()];
}

/**
 * The model a message chooses, matched only against `allowed`: first an exact
 * id or name, then the start of one, trying the longest reading first.
 */
export function chooseModel(text: string, allowed: AllowedModel[]): ModelChoice {
	const options = readings(text);
	if (!options.length) return { kind: "none" };
	const keyed = keyedModels(allowed);
	const pick = (option: Reading, exact: boolean): ModelChoice | null => {
		const matches = fitting(keyed, option.key, exact);
		if (matches.length === 1) {
			const longer = options.slice(0, options.indexOf(option)).map((reading) => reading.named);
			return { kind: "chosen", model: matches[0], prompt: option.prompt, longer, exact };
		}
		if (matches.length > 1) return { kind: "ambiguous", named: option.named, matches };
		return null;
	};
	for (const option of options) {
		const exact = pick(option, true);
		if (exact) return exact;
	}
	for (const option of options) {
		const started = pick(option, false);
		if (started) return started;
	}
	// What they most likely meant to name: the text before the first colon.
	return { kind: "not_allowed", named: options[options.length - 1].named };
}

export type Comparison =
	/** No `compare <models>:`: an ordinary message. */
	| { kind: "none" }
	/**
	 * `longer`: the longer readings of the last model's name, longest first, as for
	 * `with` (one of them may name another catalogue model); `exact`: whether that
	 * last name was a whole id or name.
	 */
	| { kind: "chosen"; models: AllowedModel[]; prompt: string; longer: string[]; exact: boolean }
	/**
	 * `unmatched`: the names that are no allowed model, `named` the first of them.
	 * `listed`: another name in the list is an allowed model, so this is a Compare
	 * whatever they are.
	 */
	| { kind: "not_allowed"; named: string; unmatched: string[]; listed: boolean }
	| { kind: "ambiguous"; named: string; matches: AllowedModel[] }
	/** One model, more than three, or the same model twice. */
	| { kind: "count" }
	| { kind: "no_question" };

export type ComparisonRefusal = Exclude<Comparison, { kind: "none" | "chosen" }>;

type Named = { named: string; key: string; start: number };

/** A reading's model text split at its commas, with where each name starts in it. Empty names are skipped. */
function listedNames(named: string): Named[] {
	const names: Named[] = [];
	let start = 0;
	for (const part of named.split(",")) {
		const key = comparable(part);
		if (key) names.push({ named: part.trim(), key, start });
		start += part.length + 1;
	}
	return names;
}

type Resolved = { model: AllowedModel; exact: boolean } | { ambiguous: AllowedModel[] } | null;

function resolve(keyed: Keyed[], key: string): Resolved {
	for (const exact of [true, false]) {
		const matches = fitting(keyed, key, exact);
		if (matches.length === 1) return { model: matches[0], exact };
		if (matches.length > 1) return { ambiguous: matches };
	}
	return null;
}

/**
 * The models a `compare <model>, <model>[, <model>]: <question>` message asks,
 * each matched only against `allowed` like `with <model>:`. As there, the
 * longest reading whose names are all whole ids or names wins, then the longest
 * whose names all fit by their start.
 */
export function chooseComparison(text: string, allowed: AllowedModel[]): Comparison {
	const options = readings(text, COMPARE_PREFIX, MAX_COMPARED_CHARS);
	if (!options.length) return { kind: "none" };
	const keyed = keyedModels(allowed);
	const read = options.map((option) => {
		const names = listedNames(option.named);
		return { option, names, resolved: names.map((name) => resolve(keyed, name.key)) };
	});
	const chosen = (entry: (typeof read)[number]): Comparison => {
		const models = entry.resolved.map((found) => (found as { model: AllowedModel }).model);
		if (models.length < MIN_COMPARED || models.length > MAX_COMPARED || new Set(models.map((model) => model.id)).size !== models.length) return { kind: "count" };
		if (!entry.option.prompt) return { kind: "no_question" };
		const last = entry.names[entry.names.length - 1];
		const longer = options.slice(0, options.indexOf(entry.option)).map((reading) => reading.named.slice(last.start).trim());
		return { kind: "chosen", models, prompt: entry.option.prompt, longer, exact: (entry.resolved[entry.resolved.length - 1] as { exact: boolean }).exact };
	};
	for (const exact of [true, false]) {
		const found = read.find((entry) => entry.names.length >= MIN_COMPARED && entry.resolved.every((resolved) => resolved !== null && "model" in resolved && (!exact || resolved.exact)));
		if (found) return chosen(found);
	}
	// What they most likely meant to list: the text before the first colon that holds a comma.
	const meant = [...read].reverse().find((entry) => entry.names.length >= MIN_COMPARED) ?? read[read.length - 1];
	if (!meant.names.length) return { kind: "none" };
	const ambiguous = meant.resolved.findIndex((resolved) => resolved !== null && "ambiguous" in resolved);
	if (ambiguous >= 0) return { kind: "ambiguous", named: meant.names[ambiguous].named, matches: (meant.resolved[ambiguous] as { ambiguous: AllowedModel[] }).ambiguous };
	const unmatched = meant.names.filter((_name, index) => meant.resolved[index] === null).map((name) => name.named);
	if (!unmatched.length) return { kind: "count" };
	return { kind: "not_allowed", named: unmatched[0], unmatched, listed: meant.resolved.some((resolved) => resolved !== null) };
}

/** A PostgREST in.() list, every value quoted. */
export function inList(values: string[]): string {
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

/** A value for one PostgREST ilike filter: LIKE's own wildcards are taken literally, and `*` (PostgREST's wildcard) is dropped. */
function likeValue(text: string): string {
	return text.replace(/\*/g, "").replace(/[\\%_]/g, "\\$&");
}

/**
 * The visible catalogue models a text names: by id, id without its lab, or name,
 * ignoring case, or with `startsWith` also those it is the start of. Each search is
 * its own single-filter query, so names with commas, brackets or quotes need no
 * quoting. Null when the catalogue can't be read.
 */
async function catalogueModels(db: Db, named: string, startsWith: boolean): Promise<string[] | null> {
	const key = likeValue(comparable(named));
	if (!key) return [];
	const end = startsWith ? "*" : "";
	const searches: Array<Record<string, string>> = [
		{ model_slug: `ilike.${key}${end}` },
		{ model_slug: `ilike.*/${key}${end}` },
		{ name: `ilike.${key}${end}` },
	];
	try {
		const found = await Promise.all(searches.map((filter) =>
			db.select<{ model_slug: string }>("v2_models", { select: "model_slug", hidden: "is.false", ...filter, limit: "5" })));
		return [...new Set(found.flat().map((row) => row.model_slug))];
	} catch {
		return null;
	}
}

/**
 * Whether text that named no allowed model names a catalogue model at all (an id,
 * an id without its lab, or a name, or the start of one). When it doesn't, the
 * message is ordinary text that happens to start with "With …:", such as "With
 * regards to the invoice: …", and is answered as written. A catalogue that can't
 * be read counts as a match, so a real model name is never answered by another
 * model without saying so.
 */
export async function namesCatalogueModel(db: Db, named: string): Promise<boolean> {
	const found = await catalogueModels(db, named, true);
	return found === null || found.length > 0;
}

/** Longer readings checked against the catalogue; a message with many colons doesn't need more. */
const MAX_LONGER_CHECKS = 5;

/**
 * The longer reading of a chosen message that names a different catalogue model,
 * if any: "with Amazon: Nova Lite: …" must not choose an allowed "Amazon: Nova Pro
 * 1.0" through its shorter reading "Amazon", nor "with lab/model:free: …" the
 * allowed "lab/model". Another model's name ends a colon or two after the match,
 * so only the shortest few longer readings are checked, together, each as an id or
 * name or the start of one. When the catalogue can't be read, a choice made by the
 * start of a name is refused (the longer reading may be the model they meant); a
 * whole id or name stands.
 */
export async function namesOtherModel(db: Db, longer: string[], chosen: string, exact: boolean): Promise<string | null> {
	const checked = longer.slice(-MAX_LONGER_CHECKS);
	const found = await Promise.all(checked.map((named) => catalogueModels(db, named, true)));
	for (const [index, ids] of found.entries()) {
		if (ids === null ? !exact : ids.some((id) => id !== chosen)) return checked[index];
	}
	return null;
}

/** The first of a Compare's unmatched names that names a catalogue model (namesCatalogueModel), or null. */
async function firstCatalogueName(db: Db, names: string[]): Promise<string | null> {
	const checked = names.slice(0, MAX_COMPARED);
	const found = await Promise.all(checked.map((named) => namesCatalogueModel(db, named)));
	const index = found.indexOf(true);
	return index >= 0 ? checked[index] : null;
}

/**
 * Whether a `compare …:` message lists only catalogue models, read like
 * chooseComparison's likeliest list (the text before the first colon that holds a
 * comma): 2 or 3 names, each a whole id, id without its lab, or name. events.ts asks
 * while model choice is off: such a message gets COMPARE_OFF_TEXT privately, rather
 * than an answer by the installation's model alone that reads as if it had compared.
 * Refusing drops the message, so the evidence must be strong: the start of a name
 * isn't enough ("Compare A, B: …" would fit "Amazon: Nova Pro"), and a catalogue that
 * can't be read answers the message as written.
 */
export async function listsCatalogueModels(db: Db, message: string): Promise<boolean> {
	const listed = readings(message, COMPARE_PREFIX, MAX_COMPARED_CHARS)
		.reverse()
		.map((reading) => listedNames(reading.named))
		.find((names) => names.length >= MIN_COMPARED);
	if (!listed || listed.length > MAX_COMPARED) return false;
	const found = await Promise.all(listed.map((name) => catalogueModels(db, name.named, false)));
	return found.every((ids) => ids !== null && ids.length > 0);
}

/** The private reply to a Compare while model choice is off (listsCatalogueModels). */
export const COMPARE_OFF_TEXT = [
	"Comparing models isn't turned on here, so I didn't answer.",
	"",
	"An admin can turn it on in Phaseo, under Settings → Slack → Model choice, by letting people choose a model per message and picking the models they may use. Without `compare …:`, I answer with this workspace's model.",
].join("\n");

export type ComparisonDecision =
	| { kind: "none" }
	| { kind: "chosen"; models: string[]; prompt: string }
	| { kind: "refused"; reason: ComparisonRefusal["kind"]; text: string };

/**
 * Whether a message is a Compare, with the checks `with <model>:` gets in
 * events.ts: a longer reading of the last name may name another catalogue model,
 * and a list that names no allowed model is an ordinary message unless one of its
 * names is a catalogue model ("Compare the two plans, then pick one: …").
 */
export async function decideComparison(db: Db, installation: Pick<Installation, "allowed_models">, message: string): Promise<ComparisonDecision> {
	const allowed = allowedModels(installation, await modelNames(db, installation.allowed_models));
	let comparison = chooseComparison(message, allowed);
	if (comparison.kind === "chosen") {
		const other = await namesOtherModel(db, comparison.longer, comparison.models[comparison.models.length - 1].id, comparison.exact);
		if (other) comparison = { kind: "not_allowed", named: other, unmatched: [other], listed: true };
	} else if (comparison.kind === "not_allowed" && !comparison.listed) {
		const named = await firstCatalogueName(db, comparison.unmatched);
		if (!named) return { kind: "none" };
		comparison = { ...comparison, named };
	}
	if (comparison.kind === "none") return comparison;
	if (comparison.kind === "chosen") return { kind: "chosen", models: comparison.models.map((model) => model.id), prompt: comparison.prompt };
	return { kind: "refused", reason: comparison.kind, text: comparisonRefusalText(comparison, allowed) };
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

/** The private reply to a Compare that can't be answered: why, and the models to choose from. */
export function comparisonRefusalText(refusal: ComparisonRefusal, allowed: AllowedModel[]): string {
	const named = "named" in refusal ? `“${escapeText(unescapeText(refusal.named))}”` : "";
	const opening = refusal.kind === "ambiguous"
		? `${named} could be more than one of the models you can choose (${refusal.matches.map((model) => escapeText(model.name)).join(", ")}), so I didn't compare them. Name one of them.`
		: refusal.kind === "not_allowed"
			? `${named} isn't one of the models you can choose here, so I didn't compare them.`
			: refusal.kind === "count"
				? `Name ${MIN_COMPARED} or ${MAX_COMPARED} different models to compare, separated by commas, so I didn't answer.`
				: "Add your question after the colon, so I didn't answer.";
	const example = allowed.length >= MIN_COMPARED ? `\`compare ${escapeText(allowed[0].name)}, ${escapeText(allowed[1].name)}: …\`` : "`compare &lt;model&gt;, &lt;model&gt;: …`";
	return [
		opening,
		"",
		`Start your message with \`compare &lt;model&gt;, &lt;model&gt;:\` and ${MIN_COMPARED} or ${MAX_COMPARED} of these, for example ${example}:`,
		...allowed.map((model) => `• ${listed(model)}`),
	].join("\n");
}
