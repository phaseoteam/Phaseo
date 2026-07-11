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
import { createApiKeyAction } from "@/app/(dashboard)/settings/keys/actions";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
	API_KEY_LIMIT_PRESETS,
	getApiKeyPreset,
	type ApiKeyPresetId,
} from "@/lib/gateway/secretReveal";
import { SecretRevealActions } from "./SecretRevealActions";
import { captureProductEvent } from "@/lib/productAnalytics";

export default function CreateKeyDialog({
	currentUserId,
	currentTeamId,
	currentWorkspaceId,
	teams,
	workspaces,
}: {
	currentUserId?: string | null;
	currentTeamId?: string | null;
	currentWorkspaceId?: string | null;
	teams?: Array<{ id: string | null; name: string }>;
	workspaces?: Array<{ id: string | null; name: string }>;
}) {
	const resolvedTeams = workspaces ?? teams;
	const resolvedCurrentTeamId = currentWorkspaceId ?? currentTeamId ?? null;
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [loading, setLoading] = useState(false);
	const [plainKey, setPlainKey] = useState<string | null>(null);
	const [selectedPresetId, setSelectedPresetId] =
		useState<ApiKeyPresetId>("production");
	const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
		resolvedCurrentTeamId
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
			alert("Missing user or workspace context. Make sure you are signed in.");
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
				JSON.stringify([]), // default empty scopes
				getApiKeyPreset(selectedPresetId).limits
			);
			setPlainKey(res?.plaintext ?? null);
			captureProductEvent("api_key_created", {
				preset: selectedPresetId,
				surface: "settings",
			});
		} catch (err: any) {
			const message =
				err?.message ?? "Could not create API key right now. Please try again.";
			toast.error(message);
		} finally {
			setLoading(false);
		}
	}

	function onClose() {
		setOpen(false);
		setName("");
		setPlainKey(null);
		setSelectedPresetId("production");
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
						Create a new API key for a workspace.
					</DialogDescription>
					<DialogDescription className="mt-2 text-sm text-red-600">
						The key will be shown only <strong>once</strong> - copy
						it and store it somewhere safe.
					</DialogDescription>
				</DialogHeader>

				{!plainKey ? (
					<form onSubmit={onCreate} className="space-y-4">
						{/* Team selector (dropdown placed above name input) */}
						{resolvedTeams && resolvedTeams.length > 0 ? (
							<DropdownMenu>
								<DropdownMenuTrigger render={<Button
										variant="outline"
										size="sm"
										className="w-full flex items-center justify-between" />}>

										<span>
											{resolvedTeams.find(
												(t) => t.id === selectedTeamId
											)?.name || "Personal"}
										</span>
										<ChevronDown className="ml-2 h-4 w-4" />

								</DropdownMenuTrigger>
								<DropdownMenuContent
									side="bottom"
									align="start"
									className="w-full"
								>
									{resolvedTeams.map((t) => (
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
						<div className="space-y-2">
							<div className="text-sm font-medium">Preset</div>
							<div className="grid gap-2 sm:grid-cols-2">
								{API_KEY_LIMIT_PRESETS.map((preset) => {
									const selected = selectedPresetId === preset.id;
									return (
										<button
											key={preset.id}
											type="button"
											onClick={() => setSelectedPresetId(preset.id)}
											className={[
												"rounded-md border p-3 text-left transition",
												selected
													? "border-foreground bg-muted/60"
													: "border-border hover:border-foreground/40",
											].join(" ")}
										>
											<div className="text-sm font-medium">
												{preset.label}
											</div>
											<div className="mt-1 text-xs leading-5 text-muted-foreground">
												{preset.description}
											</div>
										</button>
									);
								})}
							</div>
						</div>
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
								anyone access to your credits for your workspace.
								Keep this code secret at all times.
							</div>
						</div>
						<SecretRevealActions
							secret={plainKey}
							name={name || "AI Stats API key"}
							kind="api-key"
						/>
						<DialogFooter>
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
