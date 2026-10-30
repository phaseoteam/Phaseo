import Link from "next/link";
import Image from "next/image";
import { BookText, ExternalLink, FileText, Gamepad2, Globe2 } from "lucide-react";
import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import { Logo } from "@/components/Logo";
import ModelLinkFavicon from "./ModelLinkFavicon";
import { getGenericModelLinks } from "./modelOverviewMetadata";
import { getTranslations } from "next-intl/server";

interface ModelLinksProps {
	model: ModelOverviewPage;
	showEmpty?: boolean;
}

const LINK_FIELDS = [
	{ key: "api_reference_link", labelKey: "apiReference" },
	{ key: "paper_link", labelKey: "paper" },
	{ key: "announcement_link", labelKey: "announcement" },
	{ key: "repository_link", labelKey: "repository" },
	{ key: "weights_link", labelKey: "weights" },
] as const;

type ModelLinkLabelKey =
	| "apiReference"
	| "paper"
	| "announcement"
	| "repository"
	| "weights"
	| "documentation"
	| "website"
	| "playground"
	| "modelCard"
	| "provider"
	| "link"
	| "noLinksListed";
type ModelLinkLabels = Record<ModelLinkLabelKey, string>;

type ModelLink = {
	url: string;
	platform?: string | null;
	kind?: string | null;
	title?: string | null;
};
type ParsedModelLink = {
	key?: string;
	label?: string;
	url: string;
	platform?: string | null;
	kind?: string | null;
};

function hasLinkUrl<T extends { url?: string | null }>(
	link: T,
): link is T & { url: string } {
	return typeof link.url === "string" && link.url.trim() !== "";
}

function getPlatformKey(link: {
	key?: string;
	platform?: string | null;
	kind?: string | null;
}) {
	const kind = link.kind ?? link.platform;
	return (
		link.key ??
		(kind
			? `${kind.toLowerCase().replace(/[\s-]+/g, "_")}_link`
			: undefined)
	);
}

function getIconForLink(
	link: { key?: string; url?: string; platform?: string | null; kind?: string | null },
	model: ModelOverviewPage,
	labels: ModelLinkLabels,
) {
	const key = getPlatformKey(link);
	const platform = (link.kind ?? link.platform)?.toLowerCase() ?? "";
	if (key === "paper_link") {
		return (
			<Image
				src="/social/arxiv.svg"
				alt="arXiv"
				width={16}
				height={16}
				className="h-4 w-4 rounded"
				style={{ display: "inline-block" }}
			/>
		);
	}
	if (key === "announcement_link" || key === "model_card_link") {
		const providerId = model.organisation_id;
		if (providerId) {
			return (
				<Logo
					id={providerId}
				alt={labels.provider}
					width={20}
					height={20}
					className="h-5 w-5 rounded"
				/>
			);
		}
	}
	if (key === "weights_link") {
		return (
			<Image
				src="/social/hugging_face.svg"
				alt="Hugging Face"
				width={16}
				height={16}
				className="h-4 w-4 rounded"
				style={{ display: "inline-block" }}
			/>
		);
	}
	if (key === "repository_link") {
		return (
			<>
				<Image
					src="/social/github_light.svg"
					alt="GitHub"
					width={16}
					height={16}
					className="h-4 w-4 rounded block dark:hidden"
				/>
				<Image
					src="/social/github_dark.svg"
					alt="GitHub"
					width={16}
					height={16}
					className="h-4 w-4 rounded hidden dark:block"
				/>
			</>
		);
	}
	if (key === "api_reference_link") {
		return <BookText className="h-4 w-4" aria-label={labels.apiReference} />;
	}
	if (key === "playground_link") {
		return <Gamepad2 className="h-4 w-4" aria-label={labels.playground} />;
	}
	if (platform.includes("doc") || platform.includes("guide")) {
		return <BookText className="h-4 w-4" aria-label={labels.documentation} />;
	}
	if (platform.includes("website") || platform.includes("site")) {
		return <Globe2 className="h-4 w-4" aria-label={labels.website} />;
	}
	return <FileText className="h-4 w-4" aria-hidden="true" />;
}

function parseLinks(
	model: ModelOverviewPage,
	labels?: ModelLinkLabels,
): ParsedModelLink[] {
	const rawModelLinks = (model.model_links as ModelLink[] | undefined) ?? [];

	const fromModelLinks = getGenericModelLinks(rawModelLinks)
		.map((l) => {
			const kind = l.kind ?? l.platform;
			return {
				key: undefined as string | undefined,
				label:
					l.title?.trim() ||
					(kind ? prettyLabelForPlatform(kind, labels) : undefined),
				url: l.url,
				platform: l.platform,
				kind,
			};
		})
		.filter(hasLinkUrl);

	const fromLegacy = LINK_FIELDS.flatMap(({ key, labelKey }) => {
		const url = model[key as keyof ModelOverviewPage];
		if (typeof url !== "string" || url.trim() === "") return [];
		return [{ key, label: labels?.[labelKey], url }];
	});

	return fromModelLinks.length > 0 ? fromModelLinks : fromLegacy;
}

function getDisplayUrl(url: string) {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.replace(/^www\./, "");
		const path = parsed.pathname.replace(/\/$/, "");
		return path && path !== "/" ? `${host}${path}` : host;
	} catch {
		return url;
	}
}

export default async function ModelLinks({
	model,
	showEmpty = false,
}: ModelLinksProps) {
	const t = await getTranslations("Catalogue.modelDetail.metadata");
	const labels: ModelLinkLabels = {
		apiReference: t("apiReference"),
		paper: t("paper"),
		announcement: t("announcement"),
		repository: t("repository"),
		weights: t("weights"),
		documentation: t("documentation"),
		website: t("website"),
		playground: t("playground"),
		modelCard: t("modelCard"),
		provider: t("provider"),
		link: t("link"),
		noLinksListed: t("noLinksListed"),
	};
	const links = parseLinks(model, labels);
	if (links.length === 0) {
		if (!showEmpty) return null;

		return (
			<p className="text-sm text-muted-foreground">
				{labels.noLinksListed}
			</p>
		);
	}

	return (
		<div className="overflow-hidden rounded-lg border border-border/70 bg-card sm:grid sm:grid-cols-2 sm:gap-2 sm:overflow-visible sm:border-0 sm:bg-transparent xl:grid-cols-3">
			{links.map((link) => {
				const icon = getIconForLink(link, model, labels);
				const isWeightsLink = getPlatformKey(link) === "weights_link";
				return (
					<Link
						key={link.url}
						href={link.url ?? ""}
						target="_blank"
						rel="noopener noreferrer"
						className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/35 sm:rounded-lg sm:border sm:bg-card sm:last:border-b sm:hover:bg-muted/30"
					>
						<div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-muted/20 text-muted-foreground">
							{isWeightsLink ? icon : (
								<ModelLinkFavicon
									url={link.url}
									fallback={icon}
								/>
							)}
						</div>
						<div className="min-w-0">
							<div className="truncate text-sm font-medium text-foreground">
								{link.label ?? labels.link}
							</div>
							<div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
								{link.url ? getDisplayUrl(link.url) : ""}
							</div>
						</div>
						<ExternalLink className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
					</Link>
				);
			})}
		</div>
	);
}

// Helper: returns true when the model has any links to render.
export function hasModelLinks(model: ModelOverviewPage) {
	return parseLinks(model).length > 0;
}

function prettyLabelForPlatform(
	platform: string,
	labels?: ModelLinkLabels,
) {
	const p = platform.toLowerCase();
	if (p.includes("api") || p.includes("api_reference") || p.includes("docs"))
		return labels?.apiReference ?? "";
	if (p.includes("documentation") || p.includes("guide"))
		return labels?.documentation ?? "";
	if (p.includes("website") || p.includes("site") || p.includes("homepage"))
		return labels?.website ?? "";
	if (p.includes("playground")) return labels?.playground ?? "";
	if (p.includes("paper") || p.includes("pdf") || p.includes("arxiv"))
		return labels?.paper ?? "";
	if (
		p.includes("announce") ||
		p.includes("announcement") ||
		p.includes("blog")
	)
		return labels?.announcement ?? "";
	if (
		p.includes("model_card") ||
		p.includes("model card") ||
		p.includes("model-card")
	)
		return labels?.modelCard ?? "";
	if (p.includes("repo") || p.includes("github"))
		return labels?.repository ?? "";
	if (p.includes("weight") || p.includes("hugging"))
		return labels?.weights ?? "";
	return platform
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}
