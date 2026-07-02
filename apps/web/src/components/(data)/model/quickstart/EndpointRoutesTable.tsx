"use client";

import { HttpMethodBadge } from "@/components/HttpMethodBadge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import {
	ENDPOINT_ROUTE_PREVIEW_LIMIT,
	getVisibleEndpointRoutes,
	type EndpointRoute,
} from "./endpointRoutes";

const DOCS_BASE_URL = "https://docs.ai-stats.phaseo.app/v1";

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

function getEndpointDocsHref(endpoint: string) {
	const slug = ENDPOINT_DOCS_SLUGS[endpoint];
	return slug
		? `${DOCS_BASE_URL}/api-reference/endpoint/${slug}`
		: `${DOCS_BASE_URL}/api-reference/introduction`;
}

function EndpointRouteRow({ route }: { route: EndpointRoute }) {
	const docsHref = getEndpointDocsHref(route.value);

	return (
		<div
			className="group grid w-full grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35"
		>
			<HttpMethodBadge method={route.method} />

			<div className="min-w-0">
				<Link
					href={docsHref}
					target="_blank"
					rel="noopener noreferrer"
					className="block min-w-0 truncate font-mono text-sm text-foreground underline decoration-transparent underline-offset-4 transition-colors hover:text-primary hover:decoration-current"
				>
					{route.path}
				</Link>
				<div className="mt-0.5 truncate text-xs text-muted-foreground">
					{route.title} API reference
				</div>
			</div>

			<Link
				href={docsHref}
				target="_blank"
				rel="noopener noreferrer"
				aria-label={`Open ${route.title} API reference`}
				className="rounded-md p-1 text-muted-foreground opacity-60 transition-all hover:bg-muted hover:text-foreground hover:opacity-100 group-hover:opacity-100"
			>
				<ExternalLink className="h-3.5 w-3.5" />
			</Link>
		</div>
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
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h3 className="text-base font-semibold">Supported endpoints</h3>
					<p className="text-xs text-muted-foreground">
						Supported API reference routes for this model.
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
							? "Show fewer"
							: `Show ${hiddenEndpointRouteCount} more`}
					</Button>
				) : null}
			</div>
			<div className="overflow-hidden rounded-lg border bg-card">
				<div className="divide-y">
					{visibleEndpointRoutes.map((route) => (
						<EndpointRouteRow key={route.value} route={route} />
					))}
				</div>
			</div>
		</div>
	);
}
