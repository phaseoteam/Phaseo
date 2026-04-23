"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import {
	approveJoinRequest,
	rejectJoinRequest,
} from "@/app/(dashboard)/settings/teams/actions";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface Request {
	id: string;
	workspace_id?: string;
	invite_id?: string | null;
	requester_user_id: string;
	status?: "pending" | "accepted" | "rejected" | string | null;
	decided_by?: string | null;
	decided_at?: string | null;
	created_at?: string | null;
	teams: { name: string };
	requester?: { display_name?: string | null; avatar_url?: string | null };
	decider?: { display_name?: string | null };
}

interface Team {
	id: string;
	name: string;
}

interface Props {
	teams: Team[];
	requestsByTeam: Record<string, Request[]>;
	activeWorkspaceId?: string | undefined;
	onApprove?: (requestId: string) => Promise<void> | void;
	onReject?: (requestId: string) => Promise<void> | void;
}

function formatDate(d?: string | null) {
	if (!d) return "";
	try {
		return new Date(d).toLocaleDateString(undefined, {
			day: "2-digit",
			month: "short",
			year: "numeric",
		});
	} catch {
		return "";
	}
}

function statusBadgeClass(status?: string | null) {
	switch (status) {
		case "accepted":
			return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300";
		case "rejected":
			return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300";
		default:
			return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300";
	}
}

function statusLabel(status?: string | null) {
	switch (status) {
		case "accepted":
			return "Accepted";
		case "rejected":
			return "Rejected";
		default:
			return "Pending";
	}
}

function RequestTableRow({
	request,
	onApprove,
	onReject,
}: {
	request: Request;
	onApprove?: (id: string) => Promise<void> | void;
	onReject?: (id: string) => Promise<void> | void;
}) {
	const initialStatus = (request.status ?? "pending") as Request["status"];
	const [localStatus, setLocalStatus] = React.useState<Request["status"]>(
		initialStatus,
	);
	const [busy, setBusy] = React.useState(false);

	const handleApprove = async () => {
		setBusy(true);
		setLocalStatus("accepted");
		try {
			await toast.promise(approveJoinRequest(request.id), {
				loading: "Approving...",
				success: "Request approved",
				error: (err) => `Failed: ${err?.message || err}`,
			});
			await onApprove?.(request.id);
		} catch {
			setLocalStatus(initialStatus);
		} finally {
			setBusy(false);
		}
	};

	const handleReject = async () => {
		setBusy(true);
		setLocalStatus("rejected");
		try {
			await toast.promise(rejectJoinRequest(request.id), {
				loading: "Rejecting...",
				success: "Request rejected",
				error: (err) => `Failed: ${err?.message || err}`,
			});
			await onReject?.(request.id);
		} catch {
			setLocalStatus(initialStatus);
		} finally {
			setBusy(false);
		}
	};

	return (
		<TableRow>
			<TableCell>
				<div className="min-w-0">
					<div className="truncate text-sm font-medium">
						{request.requester?.display_name
							? request.requester.display_name
							: request.requester_user_id}
					</div>
					<div className="truncate text-xs text-muted-foreground">
						{request.requester_user_id}
					</div>
				</div>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{request.created_at ? formatDate(request.created_at) : "—"}
			</TableCell>
			<TableCell>
				<span
					className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(
						localStatus,
					)}`}
				>
					{statusLabel(localStatus)}
				</span>
			</TableCell>
			<TableCell className="text-right">
				{localStatus === "pending" ? (
					<div className="flex items-center justify-end gap-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									className="h-8 w-8 hover:text-green-600"
									onClick={handleApprove}
									disabled={busy}
									aria-label="Approve request"
								>
									<Check className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Approve</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									className="h-8 w-8 hover:text-red-600"
									onClick={handleReject}
									disabled={busy}
									aria-label="Reject request"
								>
									<X className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Reject</TooltipContent>
						</Tooltip>
					</div>
				) : (
					<span className="text-xs text-muted-foreground">Resolved</span>
				)}
			</TableCell>
		</TableRow>
	);
}

export default function TeamsRequests({
	teams,
	requestsByTeam,
	activeWorkspaceId: controlledActiveId,
	onApprove,
	onReject,
}: Props) {
	const activeWorkspaceId =
		controlledActiveId && teams.some((team) => team.id === controlledActiveId)
			? controlledActiveId
			: teams[0]?.id;

	const all = React.useMemo(() => requestsByTeam || {}, [requestsByTeam]);
	const active = React.useMemo(() => {
		if (!activeWorkspaceId) return [];
		return (all[activeWorkspaceId] || []).filter((r) => r.status === "pending");
	}, [activeWorkspaceId, all]);

	const activeTeam = teams.find((t) => t.id === activeWorkspaceId);

	return (
		<TooltipProvider delayDuration={150}>
			<section className="space-y-3">
				<div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h3 className="text-base font-semibold">Join requests</h3>
						<p className="text-sm text-muted-foreground">
							Approve or reject requests to join this workspace.
						</p>
					</div>
					<Badge variant="outline">
						{active.length} pending {active.length === 1 ? "request" : "requests"}
					</Badge>
				</div>

				{!activeTeam ? (
					<div className="text-sm text-muted-foreground">
						No workspaces available.
					</div>
				) : active.length === 0 ? (
					<div className="text-sm text-muted-foreground">
						No pending requests for {activeTeam.name}.
					</div>
				) : (
					<div className="overflow-hidden rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Requester</TableHead>
									<TableHead>Requested</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{active.map((request) => (
									<RequestTableRow
										key={request.id}
										request={request}
										onApprove={onApprove}
										onReject={onReject}
									/>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</section>
		</TooltipProvider>
	);
}
