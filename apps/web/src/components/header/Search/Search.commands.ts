import type { PaletteItem } from "./Search.types";

export const GLOBAL_ACTION_ITEMS: readonly PaletteItem[] = [
	{ id: "action-chat", title: "Start a new chat", subtitle: "Open the Phaseo chat playground", href: "/chat", keywords: ["new chat", "playground", "prompt"], shortcut: ["G", "C"] },
	{ id: "action-compare", title: "Compare models", subtitle: "Start a model comparison", href: "/compare", keywords: ["new comparison", "versus", "vs"] },
	{ id: "action-create-key", title: "Create an API key", subtitle: "Open API key settings", href: "/settings/keys", keywords: ["new key", "gateway key", "token", "credential"] },
	{ id: "action-create-preset", title: "Create a routing preset", subtitle: "Configure a reusable gateway route", href: "/settings/presets/new", keywords: ["new preset", "route", "routing"] },
	{ id: "action-create-guardrail", title: "Create a guardrail", subtitle: "Add a request or response policy", href: "/settings/guardrails/new", keywords: ["new guardrail", "safety", "policy", "validation"] },
	{ id: "action-copy-page-link", title: "Copy current page link", subtitle: "Copy this page URL to the clipboard", action: "copy-current-url", keywords: ["copy url", "share page", "clipboard"], shortcut: ["Y", "Y"] },
	{ id: "action-theme-toggle", title: "Toggle light or dark theme", subtitle: "Switch the current colour theme", action: "theme-toggle", keywords: ["appearance", "colour", "color", "mode", "dark mode", "light mode"], shortcut: ["T", "T"] },
	{ id: "action-theme-system", title: "Use system theme", subtitle: "Follow this device's appearance setting", action: "theme-system", keywords: ["appearance", "automatic theme", "auto mode"] },
	{ id: "action-theme-light", title: "Use light theme", subtitle: "Set the interface to light mode", action: "theme-light", keywords: ["appearance", "day mode", "white theme"] },
	{ id: "action-theme-dark", title: "Use dark theme", subtitle: "Set the interface to dark mode", action: "theme-dark", keywords: ["appearance", "night mode", "black theme"] },
];

export const EXTERNAL_RESOURCE_ITEMS: readonly PaletteItem[] = [
	{ id: "resource-docs", title: "Documentation", subtitle: "Browse the Phaseo developer documentation", href: "https://phaseo.app/docs/v1", external: true, keywords: ["docs", "developers", "guides"], shortcut: ["G", "D"] },
	{ id: "resource-quickstart", title: "Gateway quickstart", subtitle: "Make your first Phaseo API request", href: "https://phaseo.app/docs/v1/quickstart", external: true, keywords: ["getting started", "first request", "setup"] },
	{ id: "resource-api-reference", title: "API reference", subtitle: "Explore Phaseo Gateway endpoints", href: "https://phaseo.app/docs/v1/api-reference/introduction", external: true, keywords: ["rest api", "endpoints", "schema", "openapi"] },
	{ id: "resource-typescript-sdk", title: "TypeScript SDK", subtitle: "Read the TypeScript client documentation", href: "https://phaseo.app/docs/v1/sdk-reference/typescript/overview", external: true, keywords: ["javascript", "node", "npm", "client library"] },
	{ id: "resource-github", title: "Phaseo on GitHub", subtitle: "Open the source repository", href: "https://github.com/phaseoteam/Phaseo", external: true, keywords: ["source", "repository", "code", "contribute"] },
	{ id: "resource-status", title: "Service status", subtitle: "Check Phaseo platform availability", href: "https://status.phaseo.app", external: true, keywords: ["uptime", "incident", "outage", "health"] },
	{ id: "resource-report-issue", title: "Report an issue", subtitle: "Open a bug report on GitHub", href: "https://github.com/phaseoteam/Phaseo/issues/new/choose", external: true, keywords: ["bug", "feedback", "support", "github issue"] },
];

function decodePathSegment(value: string | undefined): string | null {
	if (!value) return null;
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function getContextItems(pathname: string): PaletteItem[] {
	const segments = pathname.split("/").filter(Boolean);
	const [section, firstId, secondId] = segments;

	if (section === "internal") {
		const items: PaletteItem[] = [
			{ id: "context-internal-cache", title: "Cache Control Centre", subtitle: "Purge Cloudflare Worker cache scopes", href: "/internal/cache", keywords: ["cache", "purge", "evict", "cloudflare", "revalidate"] },
		];
		const resource = segments[2];
		let scope: string | null = null;
		let target: string | null = null;
		if (segments[1] === "data" && resource === "models" && segments[3] === "edit") {
			scope = "model";
			target = segments.slice(4).map(decodePathSegment).filter(Boolean).join("/");
		} else if (segments[1] === "data" && ["api-providers", "organisations", "benchmarks"].includes(resource ?? "")) {
			scope = { "api-providers": "provider", organisations: "organisation", benchmarks: "benchmark" }[resource ?? ""] ?? null;
			target = decodePathSegment(segments[3]);
		}
		if (scope && target) {
			items.unshift({
				id: `context-cache-${scope}-${target}`,
				title: `Open cache controls for this ${scope}`,
				subtitle: target,
				href: `/internal/cache?scope=${encodeURIComponent(scope)}&target=${encodeURIComponent(target)}`,
				keywords: ["cache", "purge", "evict", `current ${scope}`],
			});
		}
		return items;
	}

	if (section === "models" && firstId && secondId) {
		const organisationId = decodePathSegment(firstId);
		const modelSlug = decodePathSegment(secondId);
		if (!organisationId || !modelSlug) return [];
		const modelId = `${organisationId}/${modelSlug}`;

		return [
			{ id: `context-model-chat-${modelId}`, title: "Chat with this model", subtitle: modelId, href: `/chat?model=${encodeURIComponent(modelId)}`, keywords: ["playground", "prompt", "current model"] },
			{ id: `context-model-compare-${modelId}`, title: "Compare this model", subtitle: modelId, href: `/compare?models=${encodeURIComponent(modelId)}`, keywords: ["comparison", "versus", "current model"] },
			{ id: `context-model-copy-${modelId}`, title: "Copy model ID", subtitle: modelId, action: "copy-text", actionValue: modelId, keywords: ["identifier", "slug", "clipboard", "current model"] },
		];
	}

	const copyableSections: Record<string, string> = {
		"api-providers": "provider",
		benchmarks: "benchmark",
		organisations: "organisation",
	};
	const entityLabel = copyableSections[section ?? ""];
	const entityId = decodePathSegment(firstId);
	if (!entityLabel || !entityId) return [];

	return [{
		id: `context-${entityLabel}-copy-${entityId}`,
		title: `Copy ${entityLabel} ID`,
		subtitle: entityId,
		action: "copy-text",
		actionValue: entityId,
		keywords: ["identifier", "slug", "clipboard", `current ${entityLabel}`],
	}];
}

export type PaletteScope = "actions" | "all" | "models" | "navigation" | "resources";

export function parsePaletteQuery(value: string): { scope: PaletteScope; term: string } {
	const trimmed = value.trim();
	const prefix = trimmed.charAt(0);
	const scopeByPrefix: Record<string, PaletteScope> = {
		">": "actions",
		"/": "navigation",
		"@": "models",
		"?": "resources",
	};
	const scope = scopeByPrefix[prefix] ?? "all";
	return {
		scope,
		term: (scope === "all" ? trimmed : trimmed.slice(1).trim()).toLowerCase(),
	};
}
