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
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/ui/copy-button";
import { createApiKeyAction } from "@/app/(dashboard)/settings/keys/actions";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

export default function CreateKeyDialog({
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
			// surface an error so users understand why nothing happens
			setPlainKey(null);
			setLoading(false);
			alert("Missing user or team context. Make sure you are signed in.");
			return;
		}
		try {
			setLoading(true);
			// call server action and get plaintext key
			const teamArg =
				selectedTeamId === null ? "" : (selectedTeamId as string);
			const res: any = await createApiKeyAction(
				name,
				currentUserId as string,
				teamArg,
				JSON.stringify([]) // default empty scopes
			);
			setPlainKey(res?.plaintext ?? null);
		} catch (err: any) {
			const message =
				err?.message ?? "Could not create API key right now. Please try again.";
			toast.error(message);
		} finally {
			setLoading(false);
		}
	}

	function onCopy() {
		if (!plainKey) return;
		// CopyButton already writes to clipboard; just show a toast
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
					// user dismissed the dialog (backdrop click / Escape)
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
					className="flex items-center"
				>
					<Plus className="h-4 w-4" />
					Create Key
				</Button>
			</DialogTrigger>

			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create API Key</DialogTitle>
					<DialogDescription>
						Create a new API key for a team.
					</DialogDescription>
					<DialogDescription className="mt-2 text-sm text-red-600">
						The key will be shown only <strong>once</strong> - copy
						it and store it somewhere safe.
					</DialogDescription>
				</DialogHeader>

				{!plainKey ? (
					<form onSubmit={onCreate} className="space-y-4">
						{/* Team selector (dropdown placed above name input) */}
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
							placeholder="Key name (e.g. my app)"
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
						<div className="font-mono break-all select-all rounded-lg p-4 bg-gray-100 dark:bg-gray-800">
							{plainKey}
						</div>
						<div className="flex items-center gap-2">
							<div className="text-sm text-muted-foreground font-bold">
								This key will not be shown again and gives
								anyone access to your credits for your team.
								Keep this code secret at all times.
							</div>
						</div>
						<DialogFooter>
							<CopyButton
								content={plainKey ?? ""}
								size="default"
								variant="outline"
								onCopy={() => onCopy()}
								className="mr-2"
								aria-label="Copy API key"
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
