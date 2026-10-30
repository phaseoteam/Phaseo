"use client";

import React, { useMemo, useState } from "react";
import { useSettingsRouter as useRouter } from "./PrivateSettingsQuery";
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
import { Link } from "lucide-react";
import { createTeamInviteAction } from "@/app/(dashboard)/settings/teams/actions";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { CopyButton } from "@/components/ui/copy-button";

function generateCode(length = 10) {
	const alphabet =
		"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // exclude confusing chars
	let out = "";
	const cryptoObj =
		typeof window !== "undefined" &&
		(window.crypto || (window as any).msCrypto);
	if (cryptoObj && cryptoObj.getRandomValues) {
		const bytes = new Uint8Array(length);
		cryptoObj.getRandomValues(bytes);
		for (let i = 0; i < length; i++) {
			out += alphabet[bytes[i] % alphabet.length];
		}
		return out;
	}
	for (let i = 0; i < length; i++)
		out += alphabet[Math.floor(Math.random() * alphabet.length)];
	return out;
}

export default function CreateTeamInviteDialog({
	currentUserId,
	teams,
	defaultWorkspaceId,
}: {
	currentUserId?: string;
	teams: { id: string; name: string }[];
	defaultWorkspaceId?: string;
}) {
	const router = useRouter();
	const t = useTranslations("SettingsUI");
	const isWorkspaceLocked = teams.length === 1;
	const preferredTeamId = useMemo(() => {
		if (!teams?.length) return undefined;
		if (defaultWorkspaceId && teams.some((team) => team.id === defaultWorkspaceId)) {
			return defaultWorkspaceId;
		}
		return teams[0]?.id;
	}, [teams, defaultWorkspaceId]);

	const [open, setOpen] = useState(false);
	const [selectedTeam, setSelectedTeam] = useState<string | undefined>(
		preferredTeamId
	);
	const [role, setRole] = useState("member");
	const [expiresIn, setExpiresIn] = useState<number>(7);
	const [maxUses, setMaxUses] = useState<number | undefined>(undefined);
	const [loading, setLoading] = useState(false);
	const [generatedCode, setGeneratedCode] = useState<string | null>(null);

	// teams are passed in as a prop from the page

	function onOpenChange(next: boolean) {
		setOpen(next);
		if (next) {
			setGeneratedCode(null);
			setSelectedTeam(preferredTeamId);
		}
	}

	async function onCreate(e?: React.FormEvent) {
		e?.preventDefault();
		if (!selectedTeam || !currentUserId) return;
		setLoading(true);
		try {
			// generate a secure 10-char code
			const code = generateCode(10);
			// call server action to persist hashed token
			await createTeamInviteAction(
				selectedTeam,
				currentUserId,
				role,
				code,
				expiresIn,
				maxUses ?? null
			).then(() => {
				setGeneratedCode(code);
				router.refresh();
			});
		} catch {
			toast.error(t("teams.failedCreateInvite"));
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" className="select-none">
					<Link className="h-4 w-4" />
						{t("teams.createInviteButton")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("teams.createInvite")}</DialogTitle>
					<DialogDescription>
						{t("teams.createInviteDescription")}
					</DialogDescription>
				</DialogHeader>

				{!generatedCode ? (
					<form onSubmit={onCreate} className="space-y-2">
						<label className="block text-sm">{t("teams.workspace")}</label>
						{isWorkspaceLocked ? (
							<div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
								{teams[0]?.name ?? t("teams.selectedWorkspace")}
							</div>
						) : (
							<DropdownMenu>
								<DropdownMenuTrigger render={<Button
										variant="outline"
										className="w-full justify-between" />}>

										{selectedTeam
											? teams.find(
													(x) => x.id === selectedTeam
										)?.name
											: t("teams.selectWorkspace")}

								</DropdownMenuTrigger>
								<DropdownMenuContent>
									{teams.map((t) => (
										<DropdownMenuItem
											key={t.id}
											onClick={() => setSelectedTeam(t.id)}
										>
											{t.name}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						)}

						<label className="block text-sm">
							{t("teams.roleForInvitees")}
						</label>
						<DropdownMenu>
							<DropdownMenuTrigger render={<Button
									variant="outline"
									className="w-full justify-between" />}>

									{role === "admin"
										? t("teams.adminRole")
										: t("teams.memberRole")}

							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								<DropdownMenuItem
									onClick={() => setRole("admin")}
								>
									{t("teams.adminRole")}
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => setRole("member")}
								>
									{t("teams.memberRole")}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>

						<div className="grid grid-cols-2 gap-2">
							<div>
								<label className="block text-sm">
									{t("teams.expiresDays")}
								</label>
								<Input
									type="number"
									value={String(expiresIn)}
									onChange={(e) =>
										setExpiresIn(
											Math.max(
												1,
												Number(e.target.value) || 1
									)
										)
									}
								/>
							</div>
							<div>
								<label className="block text-sm">
									{t("teams.maxUsesOptional")}
								</label>
								<Input
									type="number"
									value={maxUses ?? ""}
									onChange={(e) =>
										setMaxUses(
											e.target.value === ""
												? undefined
												: Math.max(
														0,
														Number(e.target.value)
												)
										)
									}
								/>
							</div>
						</div>

						<DialogFooter>
							<DialogClose asChild>
								<Button type="button" variant="ghost">
									{t("labels.cancel")}
								</Button>
							</DialogClose>
							<Button
								type="submit"
								disabled={loading || !selectedTeam}
							>
							{loading ? t("teams.creatingInvite") : t("teams.createInviteButton")}
							</Button>
						</DialogFooter>
					</form>
				) : (
					<div className="space-y-4">
						<div className="text-sm">{t("teams.shareCode")}</div>
						<div className="flex items-center gap-2">
							<Input
								value={generatedCode}
								readOnly
								className="w-full"
							/>
							<CopyButton
								content={generatedCode ?? ""}
								size="default"
								variant="outline"
								className="mr-2"
								aria-label={t("teams.copyInviteCode")}
							/>
						</div>
						<DialogFooter>
							<DialogClose asChild>
								<Button>{t("labels.done")}</Button>
							</DialogClose>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
