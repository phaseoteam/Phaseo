"use client";

import { type KeyboardEvent } from "react";
import { HttpMethodBadge } from "@/components/HttpMethodBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	ENDPOINT_ROUTE_PREVIEW_LIMIT,
	getVisibleEndpointRoutes,
	type EndpointRoute,
} from "./endpointRoutes";

function EndpointRouteRow({
	route,
	active,
	onSelect,
}: {
	route: EndpointRoute;
	active: boolean;
	onSelect: () => void;
}) {
	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onSelect();
		}
	};

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={onSelect}
			onKeyDown={handleKeyDown}
			className="grid w-full cursor-pointer grid-cols-[72px_minmax(0,1fr)] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[72px_minmax(0,220px)_1fr_auto]"
			aria-pressed={active}
		>
			<HttpMethodBadge method={route.method} />

			<code className="truncate font-mono text-xs text-foreground">
				{route.path}
			</code>

			<div className="min-w-0 space-y-0.5 md:space-y-0">
				<div className="flex items-center gap-2 md:block">
					<span className="text-sm font-medium">{route.title}</span>
					{active ? (
						<span className="text-[10px] font-medium uppercase tracking-[0.08em] text-primary md:hidden">
							Selected
						</span>
					) : null}
				</div>
				<div className="text-xs text-muted-foreground">
					{route.description}
				</div>
			</div>

			<div className="hidden items-center gap-2 md:flex">
				{active ? (
					<Badge variant="outline" className="rounded-md text-[10px]">
						Selected
					</Badge>
				) : null}
				<Badge variant="outline" className="rounded-md text-[10px]">
					{route.tag}
				</Badge>
			</div>
		</div>
	);
}

export function EndpointRoutesTable({
	endpointRoutes,
	selectedEndpoint,
	showAllEndpointRoutes,
	onToggleShowAllEndpointRoutes,
	onSelectEndpoint,
}: {
	endpointRoutes: EndpointRoute[];
	selectedEndpoint: string;
	showAllEndpointRoutes: boolean;
	onToggleShowAllEndpointRoutes: () => void;
	onSelectEndpoint: (endpoint: string) => void;
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
					<h3 className="text-base font-semibold">Available endpoints</h3>
					<p className="text-xs text-muted-foreground">
						Supported routes for this model. Select a row to update the quickstart code.
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
				<div className="hidden grid-cols-[72px_minmax(0,220px)_1fr_auto] items-center gap-3 border-b bg-muted/40 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground md:grid">
					<span>Method</span>
					<span>Route</span>
					<span>Description</span>
					<span>Status</span>
				</div>
				<div className="divide-y">
					{visibleEndpointRoutes.map((route) => (
						<EndpointRouteRow
							key={route.value}
							route={route}
							active={route.value === selectedEndpoint}
							onSelect={() => onSelectEndpoint(route.value)}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
