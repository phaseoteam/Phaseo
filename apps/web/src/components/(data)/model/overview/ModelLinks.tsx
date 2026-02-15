import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BookText, Gamepad2 } from "lucide-react";
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
	// Paper: /social/arxiv.svg
	const key =
		link.key ?? (link.platform ? `${link.platform}_link` : undefined);
	if (key === "paper_link") {
		return (
			<img
				src="/social/arxiv.svg"
				alt="arXiv"
				width={16}
				height={16}
				className="w-4 h-4 rounded"
				style={{ display: "inline-block" }}
			/>
		);
	}
	// Announcement: /providers/{providerid}.svg
	if (key === "announcement_link") {
		const providerId = model.organisation_id;
		if (providerId) {
			return (
				<Logo
					id={providerId}
					alt="Provider"
					width={16}
					height={16}
					className="w-4 h-4 rounded inline-block"
				/>
			);
		}
	}
	// Weights: /social/hugging_face.svg
	if (key === "weights_link") {
		return (
			<img
				src="/social/hugging_face.svg"
				alt="Hugging Face"
				width={16}
				height={16}
				className="w-4 h-4 rounded"
				style={{ display: "inline-block" }}
			/>
		);
	}
	// Repository: /social/github_light.svg (light) or /social/github_dark.svg (dark)
	if (key === "repository_link") {
		return (
			<>
				<img
					src="/social/github_light.svg"
					alt="GitHub"
					width={16}
					height={16}
					className="w-4 h-4 rounded block dark:hidden"
				/>
				<img
					src="/social/github_dark.svg"
					alt="GitHub"
					width={16}
					height={16}
					className="w-4 h-4 rounded hidden dark:block"
				/>
			</>
		);
	}
	// API Reference uses a Lucide icon instead of favicon
	if (key === "api_reference_link") {
		return <BookText className="w-4 h-4" aria-label="API Reference" />;
	}
	// Playground uses a Lucide Gamepad2 icon
	if (key === "playground_link") {
		return <Gamepad2 className="w-4 h-4" aria-label="Playground" />;
	}
	return null;
}

export default function ModelLinks({ model }: ModelLinksProps) {
	// Prefer new `model.model_links` shape when present
	const rawModelLinks = (model.model_links as ModelLink[] | undefined) ?? [];

	const fromModelLinks = rawModelLinks
		.map((l) => ({
			key: undefined as string | undefined,
			label: l.platform ? prettyLabelForPlatform(l.platform) : undefined,
			url: l.url,
			platform: l.platform,
		}))
		.filter((l) => l.url && l.url.trim() !== "");

	// Fallback to legacy fields if no model_links present
	const fromLegacy = LINK_FIELDS.map(({ key, label }) => ({
		key,
		label,
		url: model[key as keyof ModelOverviewPage] as string | undefined,
	})).filter((link) => link.url && link.url.trim() !== "");

	const links = fromModelLinks.length > 0 ? fromModelLinks : fromLegacy;
	if (links.length === 0) {
		return null;
	}
	return (
		<div className="grid grid-cols-2 gap-2 mt-2 md:flex md:flex-wrap">
			{links.map((link) => (
				<Link
					key={link.url}
					href={link.url ?? ""}
					target="_blank"
					rel="noopener noreferrer"
				>
					<Button
						variant="outline"
						className="flex items-center gap-2 px-4 py-1 rounded-full w-full"
					>
						{getIconForLink(link as any, model)}
						{link.label ?? "Link"}
					</Button>
				</Link>
			))}
		</div>
	);
}

// Helper: returns true when the model has any links to render.
export function hasModelLinks(model: ModelOverviewPage) {
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

	const links = fromModelLinks.length > 0 ? fromModelLinks : fromLegacy;
	return links.length > 0;
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
	if (p.includes("repo") || p.includes("github")) return "Repository";
	if (p.includes("weight") || p.includes("hugging")) return "Weights";
	return platform;
}
