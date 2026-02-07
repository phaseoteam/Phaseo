"use client";
import React, { useState } from "react";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/ui/copy-button";
import { createProvisioningKeyAction } from "@/app/(dashboard)/settings/provisioning-keys/actions";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

export default function CreateProvisioningKeyDialog({
	currentUserId,
	currentTeamId,
	teams,
}: {
	currentUserId?: string | null;
	currentTeamId?: string | null;
	teams?: Array<{ id: string | null; name: string }>;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [loading, setLoading] = useState(false);
	const [plainKey, setPlainKey] = useState<string | null>(null);
	const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
		currentTeamId ?? null
	);

	const missingContext = !currentUserId;
	const canCreate =
		!!name && !loading && !missingContext && selectedTeamId !== undefined;

	async function onCreate(e?: React.FormEvent) {
		e?.preventDefault();
		if (!name) return;
		if (!currentUserId || selectedTeamId === undefined) {
			setPlainKey(null);
			setLoading(false);
			alert("Missing user or team context. Make sure you are signed in.");
			return;
		}
		try {
			setLoading(true);
			const teamArg =
				selectedTeamId === null ? "" : (selectedTeamId as string);
			const res: any = await createProvisioningKeyAction({
				name,
				creatorUserId: currentUserId as string,
				teamId: teamArg,
				scopes: JSON.stringify([])
			});
			setPlainKey(res?.plaintext ?? null);
		} catch {
		} finally {
			setLoading(false);
		}
	}

	function onCopy() {
		if (!plainKey) return;
		toast.success("Copied to clipboard", { duration: 2000 });
	}

	function onClose() {
		setOpen(false);
		setName("");
		setPlainKey(null);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(val: boolean) => {
				if (!val) {
					onClose();
				} else {
					setOpen(true);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button
					variant="default"
					size="sm"
					className="flex items-center bg-amber-600 hover:bg-amber-700"
				>
					<Plus className="h-4 w-4" />
					Create Management API Key
				</Button>
			</DialogTrigger>

			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldAlert className="h-5 w-5 text-amber-600" />
						Create Management API Key
					</DialogTitle>
					<DialogDescription>
						Create a new management API key with elevated permissions.
					</DialogDescription>
					<DialogDescription className="mt-2 text-sm text-red-600">
						This key will be shown only <strong>once</strong> and grants
						elevated privileges. Store it securely.
					</DialogDescription>
				</DialogHeader>

				{!plainKey ? (
					<form onSubmit={onCreate} className="space-y-4">
						{teams && teams.length > 0 ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="w-full flex items-center justify-between"
									>
										<span>
											{teams.find(
												(t) => t.id === selectedTeamId
											)?.name || "Personal"}
										</span>
										<ChevronDown className="ml-2 h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									side="bottom"
									align="start"
									className="w-full"
								>
									{teams.map((t) => (
										<DropdownMenuItem
											key={String(t.id ?? "__null")}
											onSelect={() =>
												setSelectedTeamId(t.id ?? null)
											}
										>
											{t.name}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						) : null}
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Key name (e.g. production management)"
						/>
						<DialogFooter>
							<DialogClose asChild>
								<Button
									type="button"
									variant="ghost"
									onClick={onClose}
								>
									Cancel
								</Button>
							</DialogClose>
							<Button type="submit" disabled={!canCreate}>
								{loading ? "Creating..." : "Create Key"}
							</Button>
						</DialogFooter>
					</form>
				) : (
					<div className="space-y-4">
						<div className="font-mono break-all select-all rounded-lg p-4 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700">
							{plainKey}
						</div>
						<div className="flex items-center gap-2">
							<div className="text-sm text-amber-700 dark:text-amber-400 font-bold">
								This key will not be shown again and grants elevated
								privileges. Keep this code secret at all times.
							</div>
						</div>
						<DialogFooter>
							<CopyButton
								content={plainKey ?? ""}
								size="default"
								variant="outline"
								onCopy={() => onCopy()}
								className="mr-2"
								aria-label="Copy management API key"
							/>
							<DialogClose asChild>
								<Button onClick={onClose}>Done</Button>
							</DialogClose>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
