"use client";

import React, { useState } from "react";
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

export default function CreateTeamDialog({
	currentUserId,
}: {
	currentUserId?: string;
}) {
	const [open, setOpen] = useState(false);
	const [acceptOpen, setAcceptOpen] = useState(false);
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [name, setName] = useState("");
	const [loading, setLoading] = useState(false);

	async function onCreate(e?: React.FormEvent) {
		e?.preventDefault();
		// require user and at least 2 non-whitespace characters
		if (!currentUserId) return;
		if (!name || name.trim().length < 2) return;

		try {
			setLoading(true);
			// call server action
			await createTeamAction(name, currentUserId);
			setOpen(false);
			setName("");
		} catch (err: any) {
			const message =
				err?.message ?? "Could not create team right now. Please try again.";
			toast.error(message);
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
						<span className="mr-2 select-none">Create Team</span>
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
					<DialogTitle>Create Team</DialogTitle>
					<DialogDescription>
						Enter a name for your new team.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onCreate} className="space-y-4">
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Team Name"
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
