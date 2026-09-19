import { absoluteUrl } from "@/lib/seo";
import { resolveLogo } from "@/lib/logos";

const DEFAULT_ACCENT_COLOR = 0x2563eb;
const MAX_DESCRIPTION_LENGTH = 360;

export interface DiscordModelComponentEmbedOptions {
	modelId: string;
	modelName: string;
	organisationName: string;
	modelPath: string;
	organisationId?: string | null;
	description?: string | null;
	contextLength?: number | null;
	organisationColour?: string | null;
	organisationLogoUrl?: string | null;
}

function normalizeText(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const normalized = value
		.replace(/<[^>]*>/g, "")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/[`*_>#]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return normalized || null;
}

function truncateText(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	const truncated = value.slice(0, maxLength - 1).trimEnd();
	const lastSpace = truncated.lastIndexOf(" ");
	return `${(lastSpace > maxLength / 2 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}…`;
}

function absoluteMediaUrl(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
	if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
		const previewUrl = new URL(path, `https://${process.env.VERCEL_URL}`);
		const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
		if (bypassSecret) {
			previewUrl.searchParams.set("x-vercel-protection-bypass", bypassSecret);
		}
		return previewUrl.toString();
	}
	return absoluteUrl(path);
}

function discordLogoUrlForOrganisation(
	organisationId: string | null | undefined,
): string | null {
	if (!organisationId) return null;
	const logo = resolveLogo(organisationId, { variant: "dark" });
	if (!logo.id || !logo.src) return null;
	return absoluteMediaUrl(`/logos/discord/${logo.id}.png`);
}

function formatContextLength(contextLength: number | null | undefined): string | null {
	if (!Number.isFinite(contextLength) || !contextLength || contextLength <= 0) {
		return null;
	}
	if (contextLength >= 1_000_000) {
		return `${(contextLength / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	}
	if (contextLength >= 1_000) {
		return `${Math.round(contextLength / 1_000)}K`;
	}
	return String(Math.round(contextLength));
}

export function discordAccentColor(
	colour: string | null | undefined,
): number {
	const match = colour?.trim().match(/^#?([\da-f]{6})$/i);
	return match ? Number.parseInt(match[1], 16) : DEFAULT_ACCENT_COLOR;
}

export function buildDiscordModelComponentEmbed(
	options: DiscordModelComponentEmbedOptions,
) {
	const modelName = normalizeText(options.modelName) ?? "AI model";
	const organisationName = normalizeText(options.organisationName) ?? "AI lab";
	const description = normalizeText(options.description);
	const context = formatContextLength(options.contextLength);
	const modelUrl = absoluteUrl(options.modelPath);
	const phaseoLogoUrl = absoluteUrl("/png_logo_light.png");
	const knownOrganisationLogoUrl = discordLogoUrlForOrganisation(
		options.organisationId,
	);
	const organisationLogoUrl =
		knownOrganisationLogoUrl ?? absoluteMediaUrl(options.organisationLogoUrl);
	const queryModelId = encodeURIComponent(options.modelId);
	const summary = [organisationName, context ? `${context} context` : "Model profile"]
		.join(" · ");
	const text = [
		`# [${modelName}](${modelUrl})`,
		summary,
		description ? truncateText(description, MAX_DESCRIPTION_LENGTH) : null,
	]
		.filter(Boolean)
		.join("\n");

	const components = [
		{
			type: 9,
			components: [{ type: 10, content: text }],
			accessory: {
				type: 11,
				media: { url: organisationLogoUrl ?? phaseoLogoUrl },
			},
		},
		...(organisationLogoUrl
			? [
					{ type: 14, spacing: 1 },
					{
						type: 9,
						components: [
							{
								type: 10,
								content: `Powered by [Phaseo](${absoluteUrl("/")})`,
							},
						],
						accessory: {
							type: 11,
							media: { url: phaseoLogoUrl },
						},
					},
				]
			: []),
		{ type: 14, spacing: 1 },
		{
			type: 1,
			components: [
				{ type: 2, style: 5, url: modelUrl, label: "Open" },
				{
					type: 2,
					style: 5,
					url: absoluteUrl(`/chat?model=${queryModelId}`),
					label: "Chat",
				},
				{
					type: 2,
					style: 5,
					url: absoluteUrl(`/compare?models=${queryModelId}`),
					label: "Compare",
				},
				{
					type: 2,
					style: 5,
					url: absoluteUrl("/docs/v1/api-reference/introduction"),
					label: "API",
				},
			],
		},
	] as const;

	return {
		component: {
			type: 17,
			accent_color: discordAccentColor(options.organisationColour),
			components,
		},
	} as const;
}

export function serializeDiscordComponentEmbed(
	options: DiscordModelComponentEmbedOptions,
): string {
	// Keep model/catalog text inert if it ever contains HTML-like content.
	return JSON.stringify(buildDiscordModelComponentEmbed(options)).replace(
		/</g,
		"\\u003c",
	);
}

export function DiscordComponentEmbed(
	options: DiscordModelComponentEmbedOptions,
) {
	return (
		<script
			id="discord:component-embed"
			type="application/json"
			dangerouslySetInnerHTML={{
				__html: serializeDiscordComponentEmbed(options),
			}}
		/>
	);
}
