"use client";

import * as React from "react";
import { BellRing, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { setNotificationRoute } from "@/app/(dashboard)/settings/credits/actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { NotificationDestination, NotificationEventKind } from "@/lib/fetchers/internal/settingsTypes";

export default function NotificationRouteSelector(props: {
	destinations: NotificationDestination[];
	eventKind: NotificationEventKind;
	initialDestinationIds: string[];
}) {
	const resetKey = `${props.eventKind}:${props.destinations.map((destination) => destination.id).join(",")}:${props.initialDestinationIds.join(",")}`;
	return <NotificationRouteSelectorState key={resetKey} {...props} />;
}

function NotificationRouteSelectorState({ destinations, eventKind, initialDestinationIds }: {
	destinations: NotificationDestination[];
	eventKind: NotificationEventKind;
	initialDestinationIds: string[];
}) {
	const availableIds = React.useMemo(() => new Set(destinations.map((destination) => destination.id)), [destinations]);
	const [selectedIds, setSelectedIds] = React.useState(() => initialDestinationIds.filter((id) => availableIds.has(id)));
	const [saving, startSaving] = React.useTransition();
	const effectiveSelectedIds = selectedIds.filter((id) => availableIds.has(id));
	const selectedCount = effectiveSelectedIds.length;

	function update(destinationId: string, checked: boolean) {
		const previous = effectiveSelectedIds;
		const next = checked ? [...previous.filter((id) => id !== destinationId), destinationId] : previous.filter((id) => id !== destinationId);
		setSelectedIds(next);
		startSaving(async () => {
			try { await setNotificationRoute(eventKind, next); }
			catch (error) { setSelectedIds(previous); toast.error(error instanceof Error ? error.message : "Could not update destinations"); }
		});
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button type="button" variant="outline" size="sm" className="min-w-32 justify-between rounded-md" disabled={saving || destinations.length === 0}>
					<span className="flex min-w-0 items-center gap-1.5"><BellRing className="size-3.5" /><span>{selectedCount === 0 ? "No destinations" : `${selectedCount} destination${selectedCount === 1 ? "" : "s"}`}</span></span>
					<ChevronDown className="size-3.5 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Deliver this alert to</DropdownMenuLabel>
					{destinations.map((destination) => (
						<DropdownMenuCheckboxItem key={destination.id} disabled={saving} checked={effectiveSelectedIds.includes(destination.id)} onCheckedChange={(checked) => update(destination.id, Boolean(checked))} onSelect={(event) => event.preventDefault()}>
							<span className="min-w-0"><span className="block truncate text-sm">{destination.name}</span><span className="block truncate text-xs text-muted-foreground">{destination.targetPreview}</span></span>
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
