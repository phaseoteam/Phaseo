import Link from "next/link";
import { BookText, ExternalLink, Gamepad2 } from "lucide-react";
import { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import { Logo } from "@/components/Logo";

interface ModelLinksProps {
	model: ModelOverviewPage;
}

const LINK_FIELDS = [
	{ key: "api_reference_link", label: "API Reference" },
	{ key: "paper_link", label: "Paper" },
	{ key: "announcement_link", label: "Announcement" },
	{ key: "repository_link", label: "Repository" },
	{ key: "weights_link", label: "Weights" },
];

type ModelLink = { url: string; platform?: string };

function getIconForLink(
	link: { key?: string; url?: string; platform?: string },
	model: ModelOverviewPage
) {
	const key =
		link.key ??
		(link.platform
			? `${link.platform.toLowerCase().replace(/[\s-]+/g, "_")}_link`
			: undefined);
	if (key === "paper_link") {
		return (
			<img
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
					width={16}
					height={16}
					className="h-4 w-4 rounded"
				/>
			);
		}
	}
	if (key === "weights_link") {
		return (
			<img
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
				<img
					src="/social/github_light.svg"
					alt="GitHub"
					width={16}
					height={16}
					className="h-4 w-4 rounded block dark:hidden"
				/>
				<img
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
	return null;
}

function parseLinks(model: ModelOverviewPage) {
	const rawModelLinks = (model.model_links as ModelLink[] | undefined) ?? [];

	const fromModelLinks = rawModelLinks
		.map((l) => ({
			key: undefined as string | undefined,
			label: l.platform ? prettyLabelForPlatform(l.platform) : undefined,
			url: l.url,
			platform: l.platform,
		}))
		.filter((l) => l.url && l.url.trim() !== "");

	const fromLegacy = LINK_FIELDS.map(({ key, label }) => ({
		key,
		label,
		url: model[key as keyof ModelOverviewPage] as string | undefined,
	})).filter((link) => link.url && link.url.trim() !== "");

	return fromModelLinks.length > 0 ? fromModelLinks : fromLegacy;
}

function getHost(url: string) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

export default function ModelLinks({ model }: ModelLinksProps) {
	const links = parseLinks(model);
	if (links.length === 0) return null;

	return (
		<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
			{links.map((link) => (
				<Link
					key={link.url}
					href={link.url ?? ""}
					target="_blank"
					rel="noopener noreferrer"
					className="group rounded-md border border-border/70 bg-muted/10 px-3 py-2 transition-colors hover:bg-muted/30"
				>
					<div className="flex items-center justify-between gap-2">
						<div className="flex min-w-0 items-center gap-2">
							<span className="text-muted-foreground">
								{getIconForLink(link as any, model)}
							</span>
							<span className="truncate text-sm font-medium">
								{link.label ?? "Link"}
							</span>
						</div>
						<ExternalLink className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
					</div>
					<p className="mt-1 truncate text-xs text-muted-foreground">
						{link.url ? getHost(link.url) : ""}
					</p>
				</Link>
			))}
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
	return platform;
}
