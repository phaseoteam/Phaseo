"use client";

import React from "react";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";
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

interface Request {
	id: string;
	team_id?: string;
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
	activeTeamId?: string | undefined;
	onTeamChange?: (id?: string) => void;
	onApprove?: (requestId: string) => Promise<void> | void;
	onReject?: (requestId: string) => Promise<void> | void;
}

export default function TeamsRequests({
	teams,
	requestsByTeam,
	activeTeamId: controlledActiveId,
	onTeamChange,
	onApprove,
	onReject,
}: Props) {
	const [localActiveTeamId, setLocalActiveTeamId] = React.useState<
		string | undefined
	>(teams.length ? teams[0].id : undefined);

	const activeTeamId = controlledActiveId ?? localActiveTeamId;
	const setActiveTeamId = React.useCallback(
		(id?: string) => {
			if (onTeamChange) onTeamChange(id);
			else setLocalActiveTeamId(id);
		},
		[onTeamChange]
	);

	React.useEffect(() => {
		if (!teams.length) {
			setActiveTeamId(undefined);
			return;
		}
		if (!activeTeamId) {
			setActiveTeamId(teams[0].id);
			return;
		}
		if (!teams.find((t) => t.id === activeTeamId)) {
			setActiveTeamId(teams[0].id);
		}
	}, [teams, activeTeamId, setActiveTeamId]);

	const all = React.useMemo(() => requestsByTeam || {}, [requestsByTeam]);
	const active = React.useMemo(() => {
		if (!activeTeamId) return [];
		return (all[activeTeamId] || []).filter((r) => r.status === "pending");
	}, [activeTeamId, all]);

	const activeTeam = teams.find((t) => t.id === activeTeamId);

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

	// status-driven class maps
	function borderClass(status?: string | null) {
		switch (status) {
			case "accepted":
				return "border-emerald-300/60 dark:border-emerald-700/60";
			case "rejected":
				return "border-rose-300/60 dark:border-rose-700/60";
			default:
				return "border-amber-300/60 dark:border-amber-700/60";
		}
	}
	function stripeClass(status?: string | null) {
		switch (status) {
			case "accepted":
				return "before:bg-emerald-500";
			case "rejected":
				return "before:bg-rose-500";
			default:
				return "before:bg-amber-500";
		}
	}
	function dotClass(status?: string | null) {
		switch (status) {
			case "accepted":
				return "bg-emerald-500";
			case "rejected":
				return "bg-rose-500";
			default:
				return "bg-amber-500";
		}
	}

	function RequestCard({
		request,
		onApprove,
		onReject,
	}: {
		request: Request;
		onApprove?: (id: string) => Promise<void> | void;
		onReject?: (id: string) => Promise<void> | void;
	}) {
		const initialStatus = (request.status ??
			"pending") as Request["status"];
		const [localStatus, setLocalStatus] =
			React.useState<Request["status"]>(initialStatus);
		const [busy, setBusy] = React.useState(false);

		const handleApprove = async () => {
			setBusy(true);
			setLocalStatus("accepted");
			try {
				// call server action with toast feedback
				await toast.promise(approveJoinRequest(request.id), {
					loading: "Approving…",
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
					loading: "Rejecting…",
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
			<Card
				className={[
					"group relative border p-3 shadow-sm transition hover:shadow-md",
					// left coloured stripe
					"before:absolute before:left-0 before:top-0 before:h-full before:w-1.5 before:rounded-l-md before:content-['']",
					borderClass(localStatus),
					stripeClass(localStatus),
				].join(" ")}
			>
				<div className="flex items-center gap-3 pl-2">
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-medium">
							{request.requester?.display_name
								? `${request.requester.display_name} requested to join`
								: "Join request"}
						</div>
						<div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
							<span>
								{request.created_at
									? `Requested ${formatDate(
											request.created_at
									  )}`
									: ""}
							</span>

							{/* tiny status dot (subtle, no label) */}
							<span
								className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass(
									localStatus
								)}`}
								aria-hidden
							/>
						</div>
					</div>

					{/* Actions: always visible */}
					<div className="flex items-center gap-1">
						{localStatus === "pending" ? (
							<>
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
							</>
						) : null}
					</div>
				</div>
			</Card>
		);
	}

	return (
		<TooltipProvider delayDuration={150}>
			<Card className="h-full">
				<CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<CardTitle className="text-base">
							Join requests
						</CardTitle>
						<CardDescription>
							Approve or ignore requests to join this workspace.
						</CardDescription>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="outline">
							{active.length} pending{" "}
							{active.length === 1 ? "request" : "requests"}
						</Badge>
						<Select
							value={activeTeamId}
							onValueChange={(v) => setActiveTeamId(v)}
						>
							<SelectTrigger className="w-full sm:w-[200px]">
								<SelectValue placeholder="Select workspace…" />
							</SelectTrigger>
							<SelectContent>
								{teams.map((t) => (
									<SelectItem key={t.id} value={t.id}>
										{t.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</CardHeader>

				<CardContent>
					{!activeTeam ? (
						<div className="text-sm text-muted-foreground">
							No workspaces available.
						</div>
					) : active.length === 0 ? (
						<div className="text-sm text-muted-foreground">
							No pending requests for {activeTeam.name}.
						</div>
					) : (
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
							{active.map((r) => (
								<RequestCard
									key={r.id}
									request={r}
									onApprove={onApprove}
									onReject={onReject}
								/>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</TooltipProvider>
	);
}
