"use client";

import { HttpMethodBadge } from "@/components/HttpMethodBadge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { getLocalizedDocsHref } from "@/lib/docs";
import {
	ENDPOINT_ROUTE_PREVIEW_LIMIT,
	getVisibleEndpointRoutes,
	type EndpointRoute,
} from "./endpointRoutes";

const ENDPOINT_DOCS_SLUGS: Record<string, string> = {
	responses: "responses",
	"chat.completions": "chat-completions",
	messages: "anthropic-messages",
	embeddings: "embeddings",
	moderations: "moderations",
	"moderations.create": "moderations",
	"images.generations": "images-generations",
	"images.edits": "images-edits",
	"video.generations": "video-generation",
	"audio.speech": "audio-speech",
	"audio.transcriptions": "audio-transcriptions",
	"audio.translations": "audio-translations",
	"batch.create": "batches",
	"music.generate": "music-generate",
};

function getEndpointDocsHref(endpoint: string, locale: string) {
	const slug = ENDPOINT_DOCS_SLUGS[endpoint];
	const path = slug
		? `/v1/api-reference/endpoint/${slug}`
		: "/v1/api-reference/introduction";
	return getLocalizedDocsHref(locale, path);
}

function EndpointRouteRow({
	route,
	t,
	locale,
}: {
	route: EndpointRoute;
	t: ReturnType<typeof useTranslations>;
  locale: string;
}) {
	const docsHref = getEndpointDocsHref(route.value, locale);

	return (
		<Link
			href={docsHref}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={t("openApiReference", { endpoint: route.title })}
			className="group grid w-full grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
		>
			<HttpMethodBadge method={route.method} />

			<div className="min-w-0">
				<div className="min-w-0 truncate font-mono text-sm text-foreground underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-muted-foreground">
					{route.path}
				</div>
				<div className="mt-0.5 truncate text-xs text-muted-foreground">
					{t("endpointApiReference", { endpoint: route.title })}
				</div>
			</div>

			<span
				aria-hidden="true"
				className="rounded-md p-1 text-muted-foreground opacity-60 transition-all group-hover:text-foreground group-hover:opacity-100"
			>
				<ExternalLink className="h-3.5 w-3.5" />
			</span>
		</Link>
	);
}

export function EndpointRoutesTable({
	endpointRoutes,
	selectedEndpoint,
	showAllEndpointRoutes,
	onToggleShowAllEndpointRoutes,
}: {
	endpointRoutes: EndpointRoute[];
	selectedEndpoint: string;
	showAllEndpointRoutes: boolean;
	onToggleShowAllEndpointRoutes: () => void;
}) {
	const t = useTranslations("Catalogue.models.detail.quickstart");
	const locale = useLocale();
	const visibleEndpointRoutes = getVisibleEndpointRoutes(
		endpointRoutes,
		selectedEndpoint,
		showAllEndpointRoutes,
	);
	const hiddenEndpointRouteCount = Math.max(
		endpointRoutes.length - visibleEndpointRoutes.length,
		0,
	);

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h3 className="text-base font-semibold">{t("supportedEndpoints")}</h3>
					<p className="text-xs text-muted-foreground">
						{t("supportedEndpointsDescription")}
					</p>
				</div>
				{endpointRoutes.length > ENDPOINT_ROUTE_PREVIEW_LIMIT ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onToggleShowAllEndpointRoutes}
					>
						{showAllEndpointRoutes
							? t("showFewer")
							: t("showMore", { count: hiddenEndpointRouteCount })}
					</Button>
				) : null}
			</div>
			<div className="overflow-hidden rounded-lg border bg-card">
				<div className="divide-y">
					{visibleEndpointRoutes.map((route) => (
						<EndpointRouteRow key={route.value} route={route} t={t} locale={locale} />
					))}
				</div>
			</div>
		</div>
	);
}
