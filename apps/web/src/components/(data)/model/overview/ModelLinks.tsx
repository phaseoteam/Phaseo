import type { ReactNode } from "react";
import { useTranslations } from "@/i18n/react";
import Link from "@/components/link";
import Image from "@/components/image";
import {
	BookText,
	Code2,
	ExternalLink,
	FileText,
	Gamepad2,
	Globe2,
	Megaphone,
	ReceiptText,
	Server,
	Trophy,
} from "lucide-react";
import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import { Logo } from "@/components/Logo";
import {
	dedupeModelLinksByUrl,
	normaliseModelLinkKind,
	type ModelLinkKind,
} from "@/lib/models/modelLinks";
import ModelLinkFavicon from "./ModelLinkFavicon";
import { getGenericModelLinks } from "./modelOverviewMetadata";

interface ModelLinksProps {
	model: ModelOverviewPage;
	showEmpty?: boolean;
}

type ModelLink = {
	url: string;
	platform?: string | null;
	kind?: string | null;
	title?: string | null;
};

type ParsedModelLink = {
	kind: ModelLinkKind;
	title: string | null;
	url: string;
};

type LabelKey =
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
	| "link";

/** Fallback label for a link saved without a title. Kinds without their own label use "Link". */
const KIND_LABEL_KEYS: Partial<Record<ModelLinkKind, LabelKey>> = {
	announcement: "announcement",
	model_card: "modelCard",
	paper: "paper",
	weights: "weights",
	repository: "repository",
	documentation: "documentation",
	api_reference: "apiReference",
	playground: "playground",
	website: "website",
	provider: "provider",
};

function hasLinkUrl<T extends { url?: string | null }>(link: T): link is T & { url: string } {
	return typeof link.url === "string" && link.url.trim() !== "";
}

function isHuggingFace(url: string) {
	try {
		const host = new URL(url).hostname.toLowerCase();
		return host === "huggingface.co" || host.endsWith(".huggingface.co");
	} catch {
		return false;
	}
}

/** The icon used when the site's favicon is missing. */
function fallbackIcon(kind: ModelLinkKind, model: ModelOverviewPage, providerLabel: string): ReactNode {
	switch (kind) {
		case "announcement":
		case "model_card":
			return model.organisation_id ? (
				<Logo id={model.organisation_id} alt={providerLabel} width={20} height={20} className="h-5 w-5 rounded" />
			) : (
				<Megaphone className="h-4 w-4" aria-hidden="true" />
			);
		case "repository":
			return <Code2 className="h-4 w-4" aria-hidden="true" />;
		case "documentation":
		case "api_reference":
			return <BookText className="h-4 w-4" aria-hidden="true" />;
		case "playground":
			return <Gamepad2 className="h-4 w-4" aria-hidden="true" />;
		case "pricing":
			return <ReceiptText className="h-4 w-4" aria-hidden="true" />;
		case "benchmark":
			return <Trophy className="h-4 w-4" aria-hidden="true" />;
		case "provider":
			return <Server className="h-4 w-4" aria-hidden="true" />;
		case "website":
			return <Globe2 className="h-4 w-4" aria-hidden="true" />;
		default:
			return <FileText className="h-4 w-4" aria-hidden="true" />;
	}
}

function parseLinks(model: ModelOverviewPage): ParsedModelLink[] {
	const raw = ((model.model_links as ModelLink[] | undefined) ?? []).filter(hasLinkUrl);
	return dedupeModelLinksByUrl(getGenericModelLinks(raw)).map((link) => ({
		kind: normaliseModelLinkKind(link.kind ?? link.platform, link.url),
		title: link.title?.trim() || null,
		url: link.url.trim(),
	}));
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
	const t = useTranslations("Catalogue.modelDetail.metadata");
	const links = parseLinks(model);
	if (links.length === 0) {
		if (!showEmpty) return null;
		return <p className="text-sm text-muted-foreground">{t("noLinksListed")}</p>;
	}

	const providerLabel = t("provider");

	return (
		<div className="overflow-hidden rounded-lg border border-border/70 bg-card sm:grid sm:grid-cols-2 sm:gap-2 sm:overflow-visible sm:border-0 sm:bg-transparent xl:grid-cols-3">
			{links.map((link) => {
				const labelKey = KIND_LABEL_KEYS[link.kind] ?? "link";
				const label = link.title ?? t(labelKey);
				const icon = fallbackIcon(link.kind, model, providerLabel);
				return (
					<Link
						key={link.url}
						href={link.url}
						target="_blank"
						rel="noopener noreferrer"
						className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/35 sm:rounded-lg sm:border sm:bg-card sm:last:border-b sm:hover:bg-muted/30"
					>
						<div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-muted/20 text-muted-foreground">
							{isHuggingFace(link.url) ? (
								<Image
									src="/social/hugging_face.svg"
									alt="Hugging Face"
									width={16}
									height={16}
									className="h-4 w-4 rounded"
									style={{ display: "inline-block" }}
								/>
							) : (
								<ModelLinkFavicon url={link.url} fallback={icon} />
							)}
						</div>
						<div className="min-w-0">
							<div className="truncate text-sm font-medium text-foreground">{label}</div>
							<div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
								{getDisplayUrl(link.url)}
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
