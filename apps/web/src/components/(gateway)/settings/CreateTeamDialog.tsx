"use client";
import { useInvalidatePrivateSettings } from "./PrivateSettingsQuery";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
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
import { localizedSettingsError } from "@/i18n/error-messages";
import AcceptInviteDialog from "./AcceptInviteDialog";
import { createTeamAction } from "@/app/(dashboard)/settings/teams/actions";

export default function CreateTeamDialog({
	currentUserId,
}: {
	currentUserId?: string;
}) {
	const t = useTranslations("SettingsUI");
	const [open, setOpen] = useState(false);
	const invalidateSettings = useInvalidatePrivateSettings();
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
			void invalidateSettings();
			setOpen(false);
			setName("");
		} catch (err: unknown) {
			toast.error(localizedSettingsError(err, t, "Action failed"));
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
						data-settings-segment="start"
						className="flex items-center !rounded-l-lg !rounded-r-none border-r-0"
					>
						<Plus className="h-4 w-4" />
							<span className="mr-2 select-none">{t("teams.createWorkspace")}</span>
					</Button>
				</DialogTrigger>
				<DropdownMenu
					open={dropdownOpen}
					onOpenChange={setDropdownOpen}
				>
					<DropdownMenuTrigger render={<Button
							variant="outline"
							size="sm"
							data-settings-segment="end"
							className="!rounded-l-none !rounded-r-lg" />}>

							<ChevronDown
								className={
									dropdownOpen
										? "h-4 w-4 transform rotate-180 transition-transform"
										: "h-4 w-4 transition-transform"
								}
							/>

					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<DropdownMenuItem
							onClick={() => setAcceptOpen(true)}
							className="text-sm"
						>
							{t("teams.gotInviteCode")}
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
					<DialogTitle>{t("teams.createWorkspace")}</DialogTitle>
					<DialogDescription>
						{t("teams.createWorkspaceDescription")}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onCreate} className="space-y-4">
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={t("teams.workspaceName")}
					/>
					<DialogFooter>
						<DialogClose asChild>
							<Button type="button" variant="ghost">
								{t("labels.cancel")}
							</Button>
						</DialogClose>
						{/* disabled until name has at least 2 chars or while loading */}
						<Button
							type="submit"
							disabled={loading || name.trim().length < 2}
						>
							{loading ? t("labels.creating") : t("labels.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
