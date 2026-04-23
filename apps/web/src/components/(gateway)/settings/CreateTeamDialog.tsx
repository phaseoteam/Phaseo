"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, Plus } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import AcceptInviteDialog from "./AcceptInviteDialog";
import { createTeamAction } from "@/app/(dashboard)/settings/teams/actions";
import { setActiveWorkspaceAction } from "@/app/(dashboard)/actions";

export default function CreateTeamDialog({
	currentUserId,
}: {
	currentUserId?: string;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [acceptOpen, setAcceptOpen] = useState(false);
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [name, setName] = useState("");
	const [loading, setLoading] = useState(false);

	async function switchToWorkspace(workspaceId: string, workspaceName: string) {
		await toast.promise(setActiveWorkspaceAction(workspaceId), {
			loading: `Switching to ${workspaceName}...`,
			success: (result) => {
				if (!result?.ok) {
					throw new Error(result?.error || "Failed to switch workspace");
				}
				router.push(
					`/settings/workspaces/general?workspace_id=${encodeURIComponent(workspaceId)}`,
				);
				router.refresh();
				return `Switched to ${workspaceName}`;
			},
			error: (error) =>
				error instanceof Error && error.message
					? error.message
					: `Failed to switch to ${workspaceName}`,
		});
	}

	async function onCreate(e?: React.FormEvent) {
		e?.preventDefault();
		// require user and at least 2 non-whitespace characters
		if (!currentUserId) return;
		const trimmedName = name.trim();
		if (!trimmedName || trimmedName.length < 2) return;
		const toastId = toast.loading(`Creating ${trimmedName}...`);

		try {
			setLoading(true);
			const createdWorkspace = await createTeamAction(trimmedName, currentUserId);
			setOpen(false);
			setName("");
			toast.success(`Workspace "${trimmedName}" created`, {
				id: toastId,
				duration: 8000,
				action: {
					label: "Switch now",
					onClick: () => {
						if (!createdWorkspace?.id) return;
						void switchToWorkspace(createdWorkspace.id, trimmedName);
					},
				},
			});
		} catch (err: any) {
			const message =
				err?.message ?? "Could not create workspace right now. Please try again.";
			toast.error(message, { id: toastId });
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<div className="inline-flex items-center">
				<DialogTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="flex items-center rounded-r-none border-r-0"
					>
						<Plus className="h-4 w-4" />
						<span className="mr-2 select-none">Create Workspace</span>
					</Button>
				</DialogTrigger>
				<DropdownMenu
					open={dropdownOpen}
					onOpenChange={setDropdownOpen}
				>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="rounded-l-none"
						>
							<ChevronDown
								className={
									dropdownOpen
										? "h-4 w-4 transform rotate-180 transition-transform"
										: "h-4 w-4 transition-transform"
								}
							/>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onClick={() => setAcceptOpen(true)}
							className="text-sm"
						>
							Got an invite code?
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Accept invite dialog (controlled by dropdown) */}
			<AcceptInviteDialog
				currentUserId={currentUserId}
				open={acceptOpen}
				onOpenChange={setAcceptOpen}
			/>

			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create Workspace</DialogTitle>
					<DialogDescription>
						Enter a name for your new workspace.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onCreate} className="space-y-4">
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Workspace Name"
					/>
					<DialogFooter>
						<DialogClose asChild>
							<Button type="button" variant="ghost">
								Cancel
							</Button>
						</DialogClose>
						{/* disabled until name has at least 2 chars or while loading */}
						<Button
							type="submit"
							disabled={loading || name.trim().length < 2}
						>
							{loading ? "Creating..." : "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
