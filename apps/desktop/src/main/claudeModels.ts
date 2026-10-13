import type { ModelOption } from "../shared/workspace";

/**
 * Claude models Claude Code can run by exact ID, with the first Claude Code
 * release that accepts each one. Seeded from T3 Code's model manifest
 * (2026-10-02); the current generation is read from Claude Code itself.
 */
export const claudeModelManifest: { id: string; name: string; minVersion?: string }[] = [
	{ id: "claude-opus-5-5", name: "Claude Opus 5.5", minVersion: "2.1.280" },
	{ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", minVersion: "2.1.284" },
	{ id: "claude-fable-5-1", name: "Claude Fable 5.1", minVersion: "2.1.257" },
	{ id: "claude-opus-5", name: "Claude Opus 5", minVersion: "2.1.219" },
	{ id: "claude-sonnet-5", name: "Claude Sonnet 5" },
	{ id: "claude-fable-5", name: "Claude Fable 5", minVersion: "2.1.169" },
	{ id: "claude-opus-4-8", name: "Claude Opus 4.8", minVersion: "2.1.154" },
	{ id: "claude-opus-4-7", name: "Claude Opus 4.7", minVersion: "2.1.111" },
	{ id: "claude-opus-4-6", name: "Claude Opus 4.6" },
	{ id: "claude-opus-4-5", name: "Claude Opus 4.5" },
	{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
	{ id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
];

function compareVersions(left: string, right: string) {
	const a = left.split(".").map(Number), b = right.split(".").map(Number);
	for (let index = 0; index < Math.max(a.length, b.length); index++) {
		const difference = (a[index] ?? 0) - (b[index] ?? 0);
		if (difference) return Math.sign(difference);
	}
	return 0;
}

/** Turns Claude Code's aliases ("opus" → "Opus 5.5 · Best for…") into named, pinned models, then adds older models the installed version supports. */
export function claudeModelsFor(aliases: ModelOption[], installedVersion?: string): ModelOption[] {
	const version = installedVersion?.match(/\d+(?:\.\d+)+/)?.[0];
	const supported = (minVersion?: string) => !minVersion || (!!version && compareVersions(version, minVersion) >= 0);
	const current: ModelOption[] = [];
	for (const alias of aliases) {
		if (alias.id === "default") continue;
		const [described, ...details] = (alias.description ?? "").split(" · ");
		const match = described?.match(/^(Opus|Sonnet|Fable|Haiku) (\d+(?:\.\d+)?)$/);
		if (!match) { current.push(alias); continue; }
		const id = `claude-${match[1].toLowerCase()}-${match[2].replace(".", "-")}`;
		if (current.some(model => model.id === id)) continue;
		current.push({ id, name: `Claude ${described}`, description: details.find(detail => !detail.startsWith("$")) });
	}
	const known = new Set(current.map(model => model.id));
	const older = claudeModelManifest.filter(model => !known.has(model.id) && supported(model.minVersion)).map(model => ({ id: model.id, name: model.name, legacy: true }));
	if (!current.length) return claudeModelManifest.filter(model => supported(model.minVersion)).map(model => ({ id: model.id, name: model.name }));
	return [...current, ...older];
}
