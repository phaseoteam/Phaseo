"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { MoreHorizontal, Plus, SendHorizontal, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	deleteBroadcastDestinationAction,
	disableBroadcastDestinationAction,
	refreshBroadcastDestinationStatusAction,
	sendBroadcastSampleTraceAction,
} from "@/app/(dashboard)/settings/broadcast/actions";
import {
	AVAILABLE_DESTINATIONS,
	COMING_SOON_DESTINATIONS,
	type DestinationId,
} from "@/components/(gateway)/settings/observability/destinationCatalog";

type ConfiguredDestination = {
	id: string;
	destinationId: string;
	name: string;
	enabled: boolean;
	samplingRate: number;
	destinationConfig: Record<string, unknown> | null;
	updatedAt: string | null;
};

type BroadcastSettingsClientProps = {
	teamName: string | null;
	configuredDestinations: ConfiguredDestination[];
};

function formatSamplingRate(value: number) {
	const rounded = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
	return Number(rounded.toFixed(3)).toString();
}

function defaultConnectionStatus(destination: ConfiguredDestination) {
	if (!destination.enabled) return "Disabled";
	return "Unknown";
}

export default function BroadcastSettingsClient(props: BroadcastSettingsClientProps) {
	const { configuredDestinations, teamName } = props;
	const router = useRouter();
	const availableDestinations = Array.isArray(AVAILABLE_DESTINATIONS)
		? AVAILABLE_DESTINATIONS
		: [];
	const comingSoonDestinations = Array.isArray(COMING_SOON_DESTINATIONS)
		? COMING_SOON_DESTINATIONS
		: [];

	const destinationById = useMemo(() => {
		return new Map(availableDestinations.map((d) => [d.id, d]));
	}, [availableDestinations]);

	const [statusByDestinationId, setStatusByDestinationId] = useState<Record<string, string>>(
		Object.fromEntries(
			configuredDestinations.map((destination) => [
				destination.id,
				defaultConnectionStatus(destination),
			]),
		),
	);
	const [pendingDestinationId, setPendingDestinationId] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<ConfiguredDestination | null>(null);
	const [isPending, startTransition] = useTransition();

	function setStatus(destinationId: string, status: string) {
		setStatusByDestinationId((prev) => ({ ...prev, [destinationId]: status }));
	}

	function runAction(
		destinationId: string,
		action: () => Promise<void>,
		options?: { refreshAfter?: boolean },
	) {
		setPendingDestinationId(destinationId);
		startTransition(async () => {
			try {
				await action();
				if (options?.refreshAfter !== false) {
					router.refresh();
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Action failed";
				toast.error(message);
			} finally {
				setPendingDestinationId(null);
			}
		});
	}

	return (
		<div className="space-y-5">
			{configuredDestinations.length > 0 ? (
				<div className="space-y-1">
					<p className="text-sm font-medium text-muted-foreground">Configured Destinations</p>
					<div className="rounded-md border border-border/60">
						{configuredDestinations.map((destination) => {
							const definition = destinationById.get(destination.destinationId as DestinationId);
							const displayStatus =
								statusByDestinationId[destination.id] ??
								defaultConnectionStatus(destination);
							const actionDisabled = isPending && pendingDestinationId === destination.id;

							return (
								<div
									key={destination.id}
									className="grid items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_140px_160px_auto]"
								>
									<div className="min-w-0">
										<div className="flex min-w-0 items-center gap-2">
											<div className="h-6 w-6 shrink-0">
												{destination.destinationId === "webhook" ? (
													<div className="flex h-6 w-6 items-center justify-center rounded bg-muted/60 text-muted-foreground">
														<Webhook className="h-3.5 w-3.5" />
													</div>
												) : definition?.logoId ? (
													<Logo
														id={definition.logoId}
														variant="auto"
														width={24}
														height={24}
														className="h-6 w-6 object-contain"
													/>
												) : (
													<div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
														{destination.name.charAt(0)}
													</div>
												)}
											</div>
											<p className="truncate text-sm font-medium">{destination.name}</p>
										</div>
										<p className="truncate text-xs text-muted-foreground">
											{definition?.label ?? destination.destinationId}
											{teamName ? ` • ${teamName}` : ""}
										</p>
									</div>

									<div className="text-xs text-muted-foreground">
										Sampling: {formatSamplingRate(destination.samplingRate)}
									</div>

									<div>
										<Badge variant="outline">{displayStatus}</Badge>
									</div>

									<div className="flex justify-end">
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button size="icon" variant="ghost" disabled={actionDisabled}>
													<MoreHorizontal className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-56">
												<DropdownMenuItem asChild>
													<Link
														prefetch={false}
														href={`/settings/observability/destinations/new/${destination.destinationId}?edit=${destination.id}`}
													>
														Edit Connection
													</Link>
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() =>
														runAction(destination.id, async () => {
															const result =
																await refreshBroadcastDestinationStatusAction(
																	destination.id,
																);
															setStatus(destination.id, result.status);
															if (result.ok) toast.success(result.status);
															else toast.error(result.status);
														}, { refreshAfter: false })
													}
												>
													Refresh Connection Status
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() =>
														runAction(destination.id, async () => {
															const result = await sendBroadcastSampleTraceAction(
																destination.id,
															);
															setStatus(destination.id, "Connected");
															toast.success(
																`Sample trace sent${result.httpStatus ? ` (${result.httpStatus})` : ""}`,
															);
														}, { refreshAfter: false })
													}
												>
													<SendHorizontal className="mr-2 h-3.5 w-3.5" />
													Send Sample Trace
												</DropdownMenuItem>
												<DropdownMenuItem
													disabled={!destination.enabled}
													onClick={() =>
														runAction(destination.id, async () => {
															await disableBroadcastDestinationAction(destination.id);
															setStatus(destination.id, "Disabled");
															toast.success("Connection disabled");
														})
													}
												>
													Disable Connection
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													className="text-destructive focus:text-destructive"
													onClick={() => setDeleteTarget(destination)}
												>
													Delete Destination
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			) : null}

			<div className="space-y-1">
				<p className="text-sm font-medium text-muted-foreground">Available</p>
				<div className="rounded-md border border-border/60">
					{availableDestinations.map((destination) => (
						<Link
							key={destination.id}
							href={`/settings/observability/destinations/new/${destination.id}`}
							prefetch={false}
							className="flex items-center justify-between gap-3 border-b border-border/50 bg-white px-4 py-2.5 transition-colors duration-300 ease-out last:border-b-0 hover:bg-zinc-100/80 dark:bg-transparent dark:hover:bg-zinc-900/50"
						>
							<div className="min-w-0 flex items-center gap-3">
								<div className="h-6 w-6 shrink-0">
									{destination.id === "webhook" ? (
										<div className="flex h-6 w-6 items-center justify-center rounded bg-muted/60 text-muted-foreground">
											<Webhook className="h-3.5 w-3.5" />
										</div>
									) : destination.logoId ? (
										<Logo
											id={destination.logoId}
											variant="auto"
											width={24}
											height={24}
											className="h-6 w-6 object-contain"
										/>
									) : (
										<div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
											{destination.label.charAt(0)}
										</div>
									)}
								</div>
								<p className="truncate text-sm font-medium">{destination.label}</p>
							</div>
							<div className="inline-flex items-center gap-1 text-xs font-medium text-primary">
								<Plus className="h-3.5 w-3.5" />
								Add Destination
							</div>
						</Link>
					))}
				</div>
			</div>

			<div className="space-y-1">
				<p className="text-sm font-medium text-muted-foreground">Coming Soon</p>
				<div className="rounded-md border border-border/60">
					{comingSoonDestinations.map((provider) => (
						<div
							key={provider.label}
							className="flex items-center justify-between gap-3 border-b border-border/50 bg-white px-4 py-2.5 transition-colors duration-300 ease-out last:border-b-0 hover:bg-zinc-100/70 dark:bg-transparent dark:hover:bg-zinc-900/40"
						>
							<div className="min-w-0 flex items-center gap-3">
								<div className="h-6 w-6 shrink-0">
									{provider.label.toLowerCase() === "webhook" ? (
										<div className="flex h-6 w-6 items-center justify-center rounded bg-muted/60 text-muted-foreground">
											<Webhook className="h-3.5 w-3.5" />
										</div>
									) : provider.logoId ? (
										<Logo
											id={provider.logoId}
											variant="auto"
											width={24}
											height={24}
											className="h-6 w-6 object-contain"
										/>
									) : (
										<div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
											{provider.label.charAt(0)}
										</div>
									)}
								</div>
								<p className="text-sm font-medium">{provider.label}</p>
							</div>
							<Badge variant="outline">Coming Soon</Badge>
						</div>
					))}
				</div>
			</div>

			<AlertDialog
				open={Boolean(deleteTarget)}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) setDeleteTarget(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete destination?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently removes the destination connection and its key/rule mappings.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={(event) => {
								event.preventDefault();
								const target = deleteTarget;
								if (!target) return;
								runAction(target.id, async () => {
									await deleteBroadcastDestinationAction(target.id);
									toast.success("Destination deleted");
									setDeleteTarget(null);
								});
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
