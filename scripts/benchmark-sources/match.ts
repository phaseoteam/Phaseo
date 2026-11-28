/**
 * Leaderboard labels → catalogue models. Boards name models freely ("GPT-6.2 Astra (high)", "openai/gpt-6.2-astra-high",
 * "Claude Opus 4.8 Thinking 32k"), so a label is reduced to a compact key (lowercase letters and digits) after its
 * reasoning effort is split off, then looked up among every catalogue name, slug and alias. A unique hit matches; several
 * hits prefer active, visible models; anything still ambiguous is reported, never guessed. Pins in
 * v2_benchmark_source_model_pins override all of this.
 */

export type CatalogueModel = { model_slug: string; name: string; status?: string | null; hidden?: boolean | null };
export type CatalogueAlias = { alias_slug: string; model_slug: string };
export type ModelPin = { source_id: string | null; label: string; model_slug: string | null; effort: string | null; ignored: boolean };

export type MatchResult =
	| { kind: "matched"; modelSlug: string; effort: string | null; via: "pin" | "exact" | "base" | "undated" }
	| { kind: "ignored" }
	| { kind: "unmatched"; candidates: string[] };

const EFFORTS: Array<[RegExp, string]> = [
	[/\b(x-?high|extra[- ]high)\b/, "xhigh"],
	[/\bmax(imum)?\b/, "max"],
	[/\bhigh\b/, "high"],
	[/\bmedium\b|\bmed\b/, "medium"],
	[/\blow\b/, "low"],
	[/\bminimal\b/, "minimal"],
	[/\b(none|no[- ]?thinking|non[- ]?reasoning|reasoning[- ]off|thinking[- ]off|no[- ]reasoning)\b/, "none"],
];
const EFFORT_WORDS = "x-?high|extra[- ]high|max(?:imum)?|high|medium|med|low|minimal|none|no[- ]?thinking|non[- ]?reasoning|reasoning[- ]off|thinking[- ]off|no[- ]reasoning";

/** "openai/gpt-x", "accounts/fireworks/models/deepseek-v4-pro" and "anthropic:claude-x" all name the last segment. */
function withoutPath(label: string): string {
	return label.trim().replace(/^(?:[a-z0-9_.-]+\/)+(?=[a-z0-9])/i, "").replace(/^[a-z0-9_.-]+:(?=[a-z])/i, "");
}

export function compactKey(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Pin labels are stored lowercased and trimmed. */
export function pinLabel(value: string): string {
	return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Split a board label into the model part and its reasoning effort, if the label carries one. */
export function splitEffort(label: string): { base: string; effort: string | null } {
	let text = withoutPath(label);
	let effort: string | null = null;
	const scan = text.toLowerCase().replace(/[_]/g, " ");
	// Effort usually sits in brackets or at the end: "Model (high)", "model-high", "Model, max effort".
	const tail = scan.match(new RegExp(`[\\s(\\[,-]+((?:${EFFORT_WORDS})(?:[- ]?(?:effort|reasoning|thinking))?)[\\s)\\]]*$`));
	const bracket = scan.match(/\(([^)]*)\)\s*$/);
	const candidate = tail?.[1] ?? bracket?.[1] ?? null;
	if (candidate) {
		for (const [pattern, name] of EFFORTS) {
			if (pattern.test(candidate)) { effort = name; break; }
		}
		// A thinking budget, "(16K)" or "(Thinking 32K)", is its own setting.
		const budget = !effort && candidate.match(/^(?:thinking,?\s*)?(\d+)\s*k(?:\s*thinking)?$/);
		if (budget) effort = `${budget[1]}k thinking`;
	}
	if (effort) {
		const cut = tail ? scan.lastIndexOf(tail[0]) : scan.lastIndexOf(bracket![0]);
		text = text.slice(0, cut);
	}
	return { base: text.replace(/[\s,(-]+$/, "").trim(), effort };
}

/** Same key with a trailing release date removed: "-2025-08-07", "20250807", "-0902". */
function undatedKey(value: string): string | null {
	const stripped = value.replace(/[-_ ]?(20\d{2}[-_]?\d{2}[-_]?\d{2}|\d{4})$/, "");
	return stripped !== value && stripped.length > 3 ? compactKey(stripped) : null;
}

export class ModelMatcher {
	private byKey = new Map<string, Set<string>>();
	private byUndatedKey = new Map<string, Set<string>>();
	private models = new Map<string, CatalogueModel>();
	private pins = new Map<string, ModelPin>();

	constructor(models: CatalogueModel[], aliases: CatalogueAlias[], pins: ModelPin[]) {
		for (const model of models) {
			this.models.set(model.model_slug, model);
			const tail = model.model_slug.split("/").pop()!;
			for (const name of [model.name, model.model_slug, tail]) this.index(name, model.model_slug);
		}
		for (const alias of aliases) {
			if (!this.models.has(alias.model_slug)) continue;
			this.index(alias.alias_slug, alias.model_slug);
			this.index(alias.alias_slug.split("/").pop()!, alias.model_slug);
		}
		for (const pin of pins) this.pins.set(`${pin.source_id ?? ""}\u0000${pin.label}`, pin);
	}

	private index(name: string, slug: string) {
		const key = compactKey(name);
		if (key) add(this.byKey, key, slug);
		const undated = undatedKey(name);
		if (undated) add(this.byUndatedKey, undated, slug);
	}

	match(sourceId: string, label: string, explicitEffort?: string | null): MatchResult {
		const pin = this.pins.get(`${sourceId}\u0000${pinLabel(label)}`) ?? this.pins.get(`\u0000${pinLabel(label)}`);
		if (pin) {
			if (pin.ignored) return { kind: "ignored" };
			return { kind: "matched", modelSlug: pin.model_slug!, effort: pin.effort ?? explicitEffort ?? splitEffort(label).effort, via: "pin" };
		}
		// A catalogue model may itself end in a word that reads as an effort ("Qwen4 Max", "…-thinking"), so the whole
		// label is tried before an effort is split off.
		// A label that is exactly a catalogue slug names that model, even when a near-duplicate slug shares its key.
		const slug = label.trim().toLowerCase();
		if (this.models.has(slug)) return { kind: "matched", modelSlug: slug, effort: explicitEffort ?? null, via: "exact" };
		const whole = withoutPath(label);
		const attempts: Array<[string, string | null, "exact" | "base"]> = [[whole, explicitEffort ?? null, "exact"]];
		const { base, effort } = splitEffort(label);
		if (effort) attempts.push([base, explicitEffort ?? effort, "base"]);
		const misses: string[] = [];
		for (const [text, resolvedEffort, via] of attempts) {
			const direct = this.pick(this.byKey.get(compactKey(text)));
			if (direct.kind === "matched") return { ...direct, effort: resolvedEffort, via };
			misses.push(...direct.candidates);
			const dated = this.undated(text);
			if (dated.kind === "matched") return { ...dated, effort: resolvedEffort, via: "undated" };
			misses.push(...dated.candidates);
		}
		return { kind: "unmatched", candidates: [...new Set(misses)].sort() };
	}

	/**
	 * A dated label ("X-20250807") may name an undated catalogue model ("X"); an undated label may name the one dated
	 * catalogue model of that name. A dated label never matches a model carrying some other date.
	 */
	private undated(text: string) {
		const key = undatedKey(text);
		return this.pick(key ? this.byKey.get(key) : this.byUndatedKey.get(compactKey(text)));
	}

	private pick(slugs: Set<string> | undefined): { kind: "matched"; modelSlug: string; effort: null } | { kind: "unmatched"; candidates: string[] } {
		if (!slugs?.size) return { kind: "unmatched", candidates: [] };
		const all = [...slugs];
		if (all.length === 1) return { kind: "matched", modelSlug: all[0], effort: null };
		const live = all.filter((slug) => {
			const model = this.models.get(slug);
			return model && !model.hidden && (model.status ?? "active") === "active";
		});
		if (live.length === 1) return { kind: "matched", modelSlug: live[0], effort: null };
		return { kind: "unmatched", candidates: all.sort() };
	}
}

function add(map: Map<string, Set<string>>, key: string, value: string) {
	const set = map.get(key);
	if (set) set.add(value);
	else map.set(key, new Set([value]));
}
