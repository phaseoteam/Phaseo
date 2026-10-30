import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ExternalLink, Globe } from "lucide-react";
import type { OrganisationOverview as OrganisationOverviewType } from "@/lib/fetchers/organisations/types";
import { normalizeHttpUrl } from "@/lib/utils/urlSafety";

const PLATFORM_RENDER_ORDER = [
	"website",
	"discord",
	"github",
	"hugging_face",
	"instagram",
	"linkedin",
	"reddit",
	"threads",
	"tiktok",
	"x",
	"youtube",
] as const;

const PLATFORM_ALIASES: Record<string, string> = {
	twitter: "x",
	site: "website",
	web: "website",
	dicsord: "discord",
};

function normalizePlatform(rawPlatform: string) {
	const base = rawPlatform.toLowerCase();
	return PLATFORM_ALIASES[base] ?? base;
}

function displayPlatform(platform: string) {
	if (platform === "hugging_face") return "Hugging Face";
	return platform
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayUrl(url: string) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

export interface OrganisationLinksProps {
	organisation: OrganisationOverviewType;
}

// Helper to get SVG icon by platform name, with theme support for _light/_dark variants
const getSocialIcon = (platform: string) => {
	const name = normalizePlatform(platform);
	if (["website", "site", "web"].includes(name)) {
		return (
			<Globe className="w-5 h-5 inline-block align-text-bottom transition-colors" />
		);
	}
	// Add hugging_face and tiktok as themed platforms
	const themedPlatforms = ["github", "threads", "x", "tiktok"];
	if (themedPlatforms.includes(name)) {
		return (
			<>
				<Image
					src={`/social/${name}_light.svg`}
					alt=""
					width={20}
					height={20}
					className="w-5 h-5 object-contain align-text-bottom dark:hidden"
				/>
				<Image
					src={`/social/${name}_dark.svg`}
					alt=""
					width={20}
					height={20}
					className="w-5 h-5 object-contain align-text-bottom hidden dark:inline"
				/>
			</>
		);
	}
	return (
		<Image
			src={`/social/${name}.svg`}
			alt=""
			width={20}
			height={20}
			className="w-5 h-5 object-contain align-text-bottom"
		/>
	);
};

export default function OrganisationLinks({
	organisation,
}: OrganisationLinksProps) {
	const t = useTranslations("Catalogue.organisations");
	if (
		!organisation ||
		!Array.isArray(organisation.organisation_links) ||
		organisation.organisation_links.length === 0
	)
		return null;

	return (
		<div className="overflow-hidden rounded-lg border border-border/70 bg-card sm:grid sm:grid-cols-2 sm:gap-2 sm:overflow-visible sm:border-0 sm:bg-transparent xl:grid-cols-3">
				{organisation.organisation_links
					.slice()
					.sort((a, b) => {
						const aKey = normalizePlatform(a.platform || "");
						const bKey = normalizePlatform(b.platform || "");
						const aIdx = PLATFORM_RENDER_ORDER.indexOf(aKey as (typeof PLATFORM_RENDER_ORDER)[number]);
						const bIdx = PLATFORM_RENDER_ORDER.indexOf(bKey as (typeof PLATFORM_RENDER_ORDER)[number]);
						if (aIdx !== bIdx) return (aIdx < 0 ? 999 : aIdx) - (bIdx < 0 ? 999 : bIdx);
						return aKey.localeCompare(bKey);
					})
					.map((link, idx) => {
						const normalizedPlatform = normalizePlatform(link.platform);
						const platformLabel = normalizedPlatform === "website" ? t("websiteLabel") : displayPlatform(normalizedPlatform);
						const safeUrl = normalizeHttpUrl(link.url);
						if (!safeUrl) return null;
						return (
							<Link
								key={link.platform + idx}
								href={safeUrl}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={t("visitPlatformPage", { name: organisation.name, platform: platformLabel })}
								className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/35 sm:rounded-lg sm:border sm:bg-card sm:last:border-b sm:hover:bg-muted/30"
							>
								<div className="flex size-8 items-center justify-center rounded-md border border-border/70 bg-muted/20 text-muted-foreground">
									{getSocialIcon(normalizedPlatform)}
								</div>
								<div className="min-w-0">
									<div className="truncate text-sm font-medium">{platformLabel}</div>
									<div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{displayUrl(safeUrl)}</div>
								</div>
								<ExternalLink className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
							</Link>
						);
					})}
		</div>
	);
}
