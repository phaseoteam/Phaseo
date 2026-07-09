"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Ban,
	CheckCircle2,
	Edit2,
	KeyRound,
	MoreVertical,
	Shield,
	Trash2,
} from "lucide-react";
import EditManagementKeyItem from "./EditManagementKeyItem";
import DeleteManagementKeyItem from "./DeleteManagementKeyItem";

type ManagementKeyState = "active" | "paused" | "expired" | "unknown";
type ManagementKeyDialogType = "edit" | "delete";
type ActiveManagementKeyDialog = {
	type: ManagementKeyDialogType;
	key: any;
} | null;

function ManagementDialogMenuItem({
	label,
	Icon,
	variant,
	onOpen,
}: {
	label: string;
	Icon: React.ComponentType<{ className?: string }>;
	variant?: "default" | "destructive";
	onOpen: () => void;
}) {
	return (
		<DropdownMenuItem variant={variant} render={<div
				className="flex w-full items-center gap-2 text-left"
				onClick={onOpen} />}>

				<Icon className="mr-2 h-4 w-4" />
				<span>{label}</span>

		</DropdownMenuItem>
	);
}

function getManagementKeyState(k: any): ManagementKeyState {
	const expiresRaw = typeof k?.expires_at === "string" ? k.expires_at : "";
	if (expiresRaw) {
		const expiresAtMs = Date.parse(expiresRaw);
		if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
			return "expired";
		}
	}

	const status = String(k?.status ?? "").toLowerCase();
	if (status === "active") return "active";
	if (status === "paused" || status === "disabled" || status === "revoked") {
		return "paused";
	}
	return "unknown";
}

function stateMeta(state: ManagementKeyState) {
	switch (state) {
		case "active":
			return {
				label: "Active",
				Icon: CheckCircle2,
				className: "text-emerald-600",
			};
		case "paused":
			return {
				label: "Disabled",
				Icon: Ban,
				className: "text-zinc-400",
			};
		case "expired":
			return {
				label: "Expired",
				Icon: Ban,
				className: "text-amber-600",
			};
		case "unknown":
			return {
				label: "Unknown",
				Icon: Shield,
				className: "text-muted-foreground",
			};
	}
}

function formatDate(value?: string | null) {
	if (!value) return "Never";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Never";
	return date.toLocaleDateString();
}

function formatExpiry(value?: string | null) {
	if (!value) return "No expiry";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "No expiry";
	const days = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
	if (days <= 0) return "Expired";
	return `${days}d`;
}

function formatKeyReference(prefix?: string | null) {
	const ref = typeof prefix === "string" ? prefix.trim() : "";
	return ref ? `aistats_v1_sk_...${ref}` : "aistats_v1_sk_...";
}

export default function ManagementKeysPanel({ teamsWithKeys }: any) {
	const [activeDialog, setActiveDialog] =
		useState<ActiveManagementKeyDialog>(null);
	const rows = useMemo(() => {
		if (!Array.isArray(teamsWithKeys)) return [];
		return teamsWithKeys.flatMap((team: any) => {
			const keys = Array.isArray(team?.keys) ? team.keys : [];
			return keys.map((key: any) => ({
				key,
				workspaceName: team?.name ?? "Workspace",
			}));
		});
	}, [teamsWithKeys]);

	if (rows.length === 0) {
		return (
			<Empty className="mt-6 rounded-xl border border-dashed border-border/80 p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<KeyRound className="h-5 w-5" />
					</EmptyMedia>
					<EmptyTitle>No management keys yet</EmptyTitle>
					<EmptyDescription>
						Create a management key when you need elevated automation access.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<>
			<div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
				<Table className="table-fixed [&_tr:last-child]:border-b-0 [&_th]:px-3 [&_td]:px-3 [&_th]:align-middle [&_td]:align-middle">
				<TableHeader className="bg-muted/30">
					<TableRow>
						<TableHead className="w-[34%]">
							Key{" "}
							<span className="ml-1 text-xs font-normal text-muted-foreground">
								({rows.length})
							</span>
						</TableHead>
						<TableHead className="w-[18%]">Workspace</TableHead>
						<TableHead className="w-[14%]">Status</TableHead>
						<TableHead className="w-[13%]">Created</TableHead>
						<TableHead className="w-[13%]">Last Used</TableHead>
						<TableHead className="w-[10%]">Expires</TableHead>
						<TableHead className="w-[5%] text-right" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map(({ key: k, workspaceName }: any) => {
						const state = getManagementKeyState(k);
						const meta = stateMeta(state);

						return (
							<TableRow key={k.id}>
								<TableCell className="min-w-0">
									<div className="flex min-w-0 items-center gap-2">
										<Tooltip delayDuration={0}>
											<TooltipTrigger asChild>
												<meta.Icon
													aria-label={meta.label}
													className={`h-4 w-4 shrink-0 ${meta.className}`}
												/>
											</TooltipTrigger>
											<TooltipContent>{meta.label}</TooltipContent>
										</Tooltip>
										<div className="min-w-0">
											<div className="truncate font-medium">{k.name}</div>
											<div className="truncate font-mono text-xs text-muted-foreground">
												{formatKeyReference(k.prefix)}
											</div>
										</div>
									</div>
								</TableCell>
								<TableCell className="min-w-0">
									<div className="truncate text-sm text-muted-foreground">
										{workspaceName}
									</div>
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-2 text-sm">
										<meta.Icon className={`h-4 w-4 ${meta.className}`} />
										<span>{meta.label}</span>
									</div>
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									{formatDate(k.created_at)}
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									{formatDate(k.last_used_at)}
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									{formatExpiry(k.expires_at)}
								</TableCell>
								<TableCell className="text-right">
									<DropdownMenu>
										<DropdownMenuTrigger render={<Button
												variant="ghost"
												size="icon"
												aria-label="Actions" />}>

												<MoreVertical />

										</DropdownMenuTrigger>
										<DropdownMenuContent
											side="bottom"
											align="end"
											className="w-40"
										>
											<ManagementDialogMenuItem
												label="Edit"
												Icon={Edit2}
												onOpen={() => setActiveDialog({ type: "edit", key: k })}
											/>
											<ManagementDialogMenuItem
												label="Delete"
												Icon={Trash2}
												variant="destructive"
												onOpen={() => setActiveDialog({ type: "delete", key: k })}
											/>
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
				</Table>
			</div>
			{activeDialog?.type === "edit" ? (
				<EditManagementKeyItem
					key={`edit-${activeDialog.key?.id ?? "key"}`}
					k={activeDialog.key}
					trigger={false}
					open
					onOpenChange={(next) => {
						if (!next) setActiveDialog(null);
					}}
				/>
			) : null}
			{activeDialog?.type === "delete" ? (
				<DeleteManagementKeyItem
					key={`delete-${activeDialog.key?.id ?? "key"}`}
					k={activeDialog.key}
					trigger={false}
					open
					onOpenChange={(next) => {
						if (!next) setActiveDialog(null);
					}}
				/>
			) : null}
		</>
	);
}
