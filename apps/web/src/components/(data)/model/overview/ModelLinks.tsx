import Link from "next/link";
import Image from "next/image";
import { BookText, ExternalLink, FileText, Gamepad2, Globe2 } from "lucide-react";
import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import { Logo } from "@/components/Logo";
import ModelLinkFavicon from "./ModelLinkFavicon";

interface ModelLinksProps {
	model: ModelOverviewPage;
	showEmpty?: boolean;
}

const LINK_FIELDS = [
	{ key: "api_reference_link", label: "API Reference" },
	{ key: "paper_link", label: "Paper" },
	{ key: "announcement_link", label: "Announcement" },
	{ key: "repository_link", label: "Repository" },
	{ key: "weights_link", label: "Weights" },
];

type ModelLink = { url: string; platform?: string };
type ParsedModelLink = {
	key?: string;
	label?: string;
	url: string;
	platform?: string;
};

function hasLinkUrl<T extends { url?: string | null }>(
	link: T,
): link is T & { url: string } {
	return typeof link.url === "string" && link.url.trim() !== "";
}

function getPlatformKey(link: {
	key?: string;
	platform?: string;
}) {
	return (
		link.key ??
		(link.platform
			? `${link.platform.toLowerCase().replace(/[\s-]+/g, "_")}_link`
			: undefined)
	);
}

function getIconForLink(
	link: { key?: string; url?: string; platform?: string },
	model: ModelOverviewPage
) {
	const key = getPlatformKey(link);
	const platform = link.platform?.toLowerCase() ?? "";
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
					alt="Provider"
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
		return <BookText className="h-4 w-4" aria-label="API Reference" />;
	}
	if (key === "playground_link") {
		return <Gamepad2 className="h-4 w-4" aria-label="Playground" />;
	}
	if (platform.includes("doc") || platform.includes("guide")) {
		return <BookText className="h-4 w-4" aria-label="Documentation" />;
	}
	if (platform.includes("website") || platform.includes("site")) {
		return <Globe2 className="h-4 w-4" aria-label="Website" />;
	}
	return <FileText className="h-4 w-4" aria-hidden="true" />;
}

function parseLinks(model: ModelOverviewPage): ParsedModelLink[] {
	const rawModelLinks = (model.model_links as ModelLink[] | undefined) ?? [];

	const fromModelLinks = rawModelLinks
		.map((l) => ({
			key: undefined as string | undefined,
			label: l.platform ? prettyLabelForPlatform(l.platform) : undefined,
			url: l.url,
			platform: l.platform,
		}))
		.filter(hasLinkUrl);

	const fromLegacy = LINK_FIELDS.flatMap(({ key, label }) => {
		const url = model[key as keyof ModelOverviewPage];
		if (typeof url !== "string" || url.trim() === "") return [];
		return [{ key, label, url }];
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

export default function ModelLinks({ model, showEmpty = false }: ModelLinksProps) {
	const links = parseLinks(model);
	if (links.length === 0) {
		if (!showEmpty) return null;

		return (
			<div className="inline-flex rounded-lg border border-border/70 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
				No links listed.
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-lg border border-border/70 bg-card sm:grid sm:grid-cols-2 sm:gap-2 sm:overflow-visible sm:border-0 sm:bg-transparent xl:grid-cols-3">
			{links.map((link) => {
				return (
					<Link
						key={link.url}
						href={link.url ?? ""}
						target="_blank"
						rel="noopener noreferrer"
						className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/35 sm:rounded-lg sm:border sm:bg-card sm:last:border-b sm:hover:bg-muted/30"
					>
						<div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-muted/20 text-muted-foreground">
							<ModelLinkFavicon
								url={link.url}
								fallback={getIconForLink(link, model)}
							/>
						</div>
						<div className="min-w-0">
							<div className="truncate text-sm font-medium text-foreground">
								{link.label ?? "Link"}
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

function prettyLabelForPlatform(platform: string) {
	const p = platform.toLowerCase();
	if (p.includes("api") || p.includes("api_reference") || p.includes("docs"))
		return "API Reference";
	if (p.includes("documentation") || p.includes("guide")) return "Documentation";
	if (p.includes("website") || p.includes("site") || p.includes("homepage"))
		return "Website";
	if (p.includes("playground")) return "Playground";
	if (p.includes("paper") || p.includes("pdf") || p.includes("arxiv"))
		return "Paper";
	if (
		p.includes("announce") ||
		p.includes("announcement") ||
		p.includes("blog")
	)
		return "Announcement";
	if (
		p.includes("model_card") ||
		p.includes("model card") ||
		p.includes("model-card")
	)
		return "Model Card";
	if (p.includes("repo") || p.includes("github")) return "Repository";
	if (p.includes("weight") || p.includes("hugging")) return "Weights";
	return platform
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}
