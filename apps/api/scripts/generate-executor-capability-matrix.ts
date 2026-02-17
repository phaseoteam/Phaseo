import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { allProviderNames } from "../src/providers/index";
import { normalizeProviderId } from "../src/lib/config/providerAliases";
import { isProviderCapabilityEnabled } from "../src/executors/index";

type CapabilityRow = {
	capability: string;
	label: string;
};

const CAPABILITIES: CapabilityRow[] = [
	{ capability: "text.generate", label: "text" },
	{ capability: "embeddings", label: "embeddings" },
	{ capability: "moderations", label: "moderations" },
	{ capability: "image.generate", label: "image_gen" },
	{ capability: "image.edit", label: "image_edit" },
	{ capability: "audio.speech", label: "audio_speech" },
	{ capability: "audio.transcription", label: "audio_transcribe" },
	{ capability: "audio.translations", label: "audio_translate" },
	{ capability: "video.generate", label: "video" },
	{ capability: "ocr", label: "ocr" },
	{ capability: "music.generate", label: "music" },
];

function toCell(value: boolean): string {
	return value ? "yes" : "no";
}

function buildAliasMap(rawProviders: string[]) {
	const aliasMap = new Map<string, Set<string>>();
	for (const raw of rawProviders) {
		const canonical = normalizeProviderId(raw);
		if (!aliasMap.has(canonical)) {
			aliasMap.set(canonical, new Set());
		}
		aliasMap.get(canonical)?.add(raw);
	}
	return aliasMap;
}

function sortProviders(providers: string[]): string[] {
	return providers.slice().sort((a, b) => a.localeCompare(b));
}

function renderMatrixRows(providers: string[]): string {
	return providers
		.map((provider) => {
			const cells = CAPABILITIES.map((cap) => toCell(isProviderCapabilityEnabled(provider, cap.capability)));
			return `| ${provider} | ${cells.join(" | ")} |`;
		})
		.join("\n");
}

function renderAliasRows(aliasMap: Map<string, Set<string>>): string {
	const rows: string[] = [];
	for (const provider of sortProviders(Array.from(aliasMap.keys()))) {
		const aliases = Array.from(aliasMap.get(provider) ?? [])
			.filter((entry) => entry !== provider)
			.sort((a, b) => a.localeCompare(b));
		if (!aliases.length) continue;
		rows.push(`| ${provider} | ${aliases.join(", ")} |`);
	}
	if (!rows.length) {
		return "| (none) | (none) |";
	}
	return rows.join("\n");
}

function buildMarkdown(): string {
	const generatedAt = new Date().toISOString();
	const rawProviders = allProviderNames();
	const aliasMap = buildAliasMap(rawProviders);
	const canonicalProviders = sortProviders(Array.from(aliasMap.keys()));
	const headerCaps = CAPABILITIES.map((cap) => cap.label).join(" | ");
	const separatorCaps = CAPABILITIES.map(() => "---").join(" | ");

	return [
		"# Executor Capability Matrix",
		"",
		`Generated: ${generatedAt}`,
		"",
		"This file tracks provider support at the executor resolver level.",
		"Status is derived from `isProviderCapabilityEnabled(providerId, capability)`.",
		"",
		"## Capability Matrix",
		"",
		`| provider | ${headerCaps} |`,
		`| --- | ${separatorCaps} |`,
		renderMatrixRows(canonicalProviders),
		"",
		"## Canonical Provider Aliases",
		"",
		"| canonical_provider | aliases |",
		"| --- | --- |",
		renderAliasRows(aliasMap),
		"",
		"## Notes",
		"",
		"- This matrix reflects resolver capability enablement, not live upstream provider health.",
		"- `yes` means the resolver can select an executor for that provider/capability.",
		"- `no` means the resolver currently blocks that provider/capability.",
		"",
	].join("\n");
}

function main() {
	const outputPath = resolve(process.cwd(), "docs", "executor-capability-matrix.md");
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, buildMarkdown(), "utf8");
	console.log(`wrote ${outputPath}`);
}

main();

