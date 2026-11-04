import type { ModelOption, ModelOptionDescriptor, ModelOptionValues } from "../shared/workspace";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
/**
 * Per-model settings for each Claude model (as of 2026-10-02). As Claude Code has them, Ultracode is a switch that runs
 * workflows at any level, and Ultrathink is a word typed in a message, not a level.
 */
type Profile = { effort: Effort[]; defaultEffort?: Effort; fastMode?: boolean; contextWindow?: "200k" | "1m"; thinking?: boolean; ultracode?: boolean; effortMap?: Partial<Record<Effort, Effort>> };

const all: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const profiles: Record<string, Profile> = {
	"fable-5": { effort: all, defaultEffort: "medium", contextWindow: "1m", ultracode: true },
	"opus-5-5": { effort: all, defaultEffort: "medium", fastMode: true, contextWindow: "1m", ultracode: true },
	"opus-5": { effort: all, defaultEffort: "high", fastMode: true, contextWindow: "1m", ultracode: true },
	"opus-4-8": { effort: all, defaultEffort: "high", fastMode: true, ultracode: true },
	"opus-4-7": { effort: all, defaultEffort: "xhigh", fastMode: true, effortMap: { xhigh: "max" } },
	"opus-4-6": { effort: ["low", "medium", "high", "max"], defaultEffort: "high", fastMode: true, contextWindow: "1m" },
	"opus-4-5": { effort: ["low", "medium", "high", "max"], defaultEffort: "high", fastMode: true },
	"sonnet-5": { effort: all, defaultEffort: "high", contextWindow: "200k" },
	"sonnet-4-6": { effort: ["low", "medium", "high", "max"], defaultEffort: "high", contextWindow: "200k", effortMap: { max: "high" } },
	"haiku-4-5": { effort: [], thinking: true },
};

/**
 * Claude models Claude Code can run by exact ID, with the first Claude Code
 * release that accepts each one and its settings profile. The current generation is read from Claude Code itself.
 */
export const claudeModelManifest: { id: string; name: string; minVersion?: string; profile: string }[] = [
	{ id: "claude-opus-5-5", name: "Claude Opus 5.5", minVersion: "2.1.280", profile: "opus-5-5" },
	{ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", minVersion: "2.1.284", profile: "sonnet-5" },
	{ id: "claude-fable-5-1", name: "Claude Fable 5.1", minVersion: "2.1.257", profile: "fable-5" },
	{ id: "claude-opus-5", name: "Claude Opus 5", minVersion: "2.1.219", profile: "opus-5" },
	{ id: "claude-sonnet-5", name: "Claude Sonnet 5", profile: "sonnet-5" },
	{ id: "claude-fable-5", name: "Claude Fable 5", minVersion: "2.1.169", profile: "fable-5" },
	{ id: "claude-opus-4-8", name: "Claude Opus 4.8", minVersion: "2.1.154", profile: "opus-4-8" },
	{ id: "claude-opus-4-7", name: "Claude Opus 4.7", minVersion: "2.1.111", profile: "opus-4-7" },
	{ id: "claude-opus-4-6", name: "Claude Opus 4.6", profile: "opus-4-6" },
	{ id: "claude-opus-4-5", name: "Claude Opus 4.5", profile: "opus-4-5" },
	{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", profile: "sonnet-4-6" },
	{ id: "claude-haiku-4-5", name: "Claude Haiku 4.5", profile: "haiku-4-5" },
];

/** What Claude Code reports about an alias it supports (SDK `ModelInfo`). */
export type ClaudeAlias = ModelOption & { resolvedModel?: string; supportsEffort?: boolean; supportedEffortLevels?: string[]; supportsFastMode?: boolean };

const effortLabels: Record<Effort, { label: string; description?: string }> = {
	low: { label: "Low" }, medium: { label: "Medium" }, high: { label: "High" }, xhigh: { label: "Extra High" }, max: { label: "Max" },
};

function descriptors(profile: Profile): ModelOptionDescriptor[] {
	const result: ModelOptionDescriptor[] = [];
	if (profile.effort.length) result.push({ id: "effort", label: "Reasoning", type: "select", options: profile.effort.map(id => ({ id, ...effortLabels[id], ...(id === profile.defaultEffort ? { isDefault: true } : {}) })) });
	if (profile.ultracode) result.push({ id: "ultracode", label: "Ultracode", type: "boolean", default: false });
	if (profile.fastMode) result.push({ id: "fastMode", label: "Fast Mode", type: "boolean", default: false });
	if (profile.thinking) result.push({ id: "thinking", label: "Thinking", type: "boolean", default: false });
	return result;
}

/** Settings for a model the manifest does not know yet, from what Claude Code reports about it. */
function reportedProfile(alias: ClaudeAlias): Profile {
	const effort = (alias.supportsEffort ? alias.supportedEffortLevels ?? [] : []).filter((value): value is Effort => value in effortLabels);
	return { effort, defaultEffort: effort.includes("medium") ? "medium" : effort[0], fastMode: alias.supportsFastMode };
}

/** Claude Code's own aliases ("opus") and the model each runs now, as it last reported them. */
const latestAliases = new Map<string, string>();
const profileFor = (id: string) => profiles[claudeModelManifest.find(model => model.id === (latestAliases.get(id) ?? id))?.profile ?? ""];

/**
 * What Claude Code reports about a model narrows its manifest profile, so the picker offers only levels it accepts:
 * a level stays when the effort it sends is reported, and Fast mode follows the report.
 */
function withReported(profile: Profile, alias: ClaudeAlias): Profile {
	const levels = alias.supportsEffort === false ? [] : alias.supportedEffortLevels;
	const effort = levels ? profile.effort.filter(id => levels.includes(profile.effortMap?.[id] ?? id)) : profile.effort;
	return { ...profile, effort, defaultEffort: profile.defaultEffort && effort.includes(profile.defaultEffort) ? profile.defaultEffort : undefined, ...(alias.supportsFastMode !== undefined ? { fastMode: alias.supportsFastMode } : {}) };
}

function compareVersions(left: string, right: string) {
	const a = left.split(".").map(Number), b = right.split(".").map(Number);
	for (let index = 0; index < Math.max(a.length, b.length); index++) {
		const difference = (a[index] ?? 0) - (b[index] ?? 0);
		if (difference) return Math.sign(difference);
	}
	return 0;
}

/** Turns Claude Code's aliases ("opus" → Opus 5.5) into named, pinned models with their settings, then adds older models the installed version supports. */
export function claudeModelsFor(aliases: ClaudeAlias[], installedVersion?: string): ModelOption[] {
	const version = installedVersion?.match(/\d+(?:\.\d+)+/)?.[0];
	const supported = (minVersion?: string) => !minVersion || (!!version && compareVersions(version, minVersion) >= 0);
	const withOptions = (model: ModelOption, profile?: Profile): ModelOption => { const options = profile ? descriptors(profile) : []; return options.length ? { ...model, options } : model; };
	const current: ModelOption[] = [], latest: ModelOption[] = [];
	for (const alias of aliases) {
		if (alias.id === "default") continue;
		const [described, ...details] = (alias.description ?? "").split(" · ");
		const match = described?.match(/^(Opus|Sonnet|Fable|Haiku) (\d+(?:\.\d+)?)$/);
		const id = alias.resolvedModel?.replace(/\[1m\]$/, "") || (match ? `claude-${match[1].toLowerCase()}-${match[2].replace(".", "-")}` : undefined);
		if (!id) { current.push({ id: alias.id, name: alias.name, description: alias.description }); continue; }
		if (/^[a-z]+$/.test(alias.id) && alias.id !== id) {
			latestAliases.set(alias.id, id);
			const profile = profileFor(id) ? withReported(profileFor(id)!, alias) : reportedProfile(alias);
			latest.push(withOptions({ id: alias.id, name: `Claude ${alias.id.charAt(0).toUpperCase()}${alias.id.slice(1)} Latest`, description: `Always Claude Code's newest ${alias.id.charAt(0).toUpperCase()}${alias.id.slice(1)}.`, latestOf: id }, profile));
		}
		if (current.some(model => model.id === id)) continue;
		const name = match ? `Claude ${described}` : claudeModelManifest.find(model => model.id === id)?.name ?? alias.name;
		current.push(withOptions({ id, name, description: match ? details.find(detail => !detail.startsWith("$")) : alias.description }, profileFor(id) ? withReported(profileFor(id)!, alias) : reportedProfile(alias)));
	}
	const known = new Set(current.map(model => model.id));
	const older = claudeModelManifest.filter(model => !known.has(model.id) && supported(model.minVersion)).map(model => withOptions({ id: model.id, name: model.name, legacy: true }, profiles[model.profile]));
	if (!current.length) return older.map(model => ({ ...model, legacy: undefined }));
	return [...current, ...latest, ...older];
}

/** Typed in a message, as in Claude Code: that turn runs at Extra High, unless Max is already chosen. */
export const typesUltrathink = (text: string) => /\bultrathink\b/i.test(text);

/**
 * How the chosen settings reach Claude Code: SDK `effort`, a `[1m]` model suffix and session `settings`. A message that
 * types "ultrathink" raises its turn to Extra High. Chats saved when Ultracode and Ultrathink were levels keep working.
 */
export function claudeRunOptions(model: string, values: ModelOptionValues | undefined, text = "") {
	const profile = profileFor(model);
	// Models newer than the manifest offered the settings Claude Code reported; accept its standard ones.
	const options = descriptors(profile ?? { effort: all, fastMode: true });
	const offered = (id: string) => options.find(option => option.id === id);
	const effortOption = offered("effort");
	const saved = values?.effort === "ultracode" ? "xhigh" : values?.effort;
	const levels = effortOption?.type === "select" ? effortOption.options.map(option => option.id as Effort) : [];
	let chosen = typeof saved === "string" && levels.includes(saved as Effort) ? saved as Effort : undefined;
	const ultrathink = (typesUltrathink(text) || values?.effort === "ultrathink") && levels.includes("xhigh");
	if (ultrathink && chosen !== "max") chosen = "xhigh";
	const effort = chosen ? profile?.effortMap?.[chosen] ?? chosen : undefined;
	// Each model runs at its own context window, 1M where it offers one; it is not a choice.
	const window = profile?.contextWindow;
	const settings = {
		...(offered("fastMode") ? { fastMode: values?.fastMode === true } : {}),
		...(offered("thinking") && typeof values?.thinking === "boolean" ? { alwaysThinkingEnabled: values.thinking } : {}),
		...(offered("ultracode") && (values?.ultracode === true || values?.effort === "ultracode") ? { ultracode: true } : {}),
	};
	return { model: window === "1m" ? `${model}[1m]` : model, effort, settings: Object.keys(settings).length ? settings : undefined };
}
