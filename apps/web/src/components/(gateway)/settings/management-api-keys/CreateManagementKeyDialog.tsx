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
import { createManagementKeyAction } from "@/app/(dashboard)/settings/management-api-keys/actions";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { SecretRevealActions } from "../keys/SecretRevealActions";

const KEY_TEMPLATES = [
	{
		value: "read-only",
		label: "Read",
		description: "View all control-plane resources without changing them.",
	},
	{
		value: "read-write",
		label: "Write",
		description: "Read and change resources, without delete access.",
	},
	{
		value: "full-control",
		label: "All",
		description: "All management API capabilities.",
	},
] as const;

function toIsoFromDateTimeLocalInput(value: string): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return null;
	return date.toISOString();
}

export default function CreateManagementKeyDialog({
	currentUserId,
	currentWorkspaceId,
	workspaces,
}: {
	currentUserId?: string | null;
	currentWorkspaceId?: string | null;
	workspaces?: Array<{ id: string | null; name: string }>;
}) {
	const resolveInitialWorkspaceId = React.useCallback(() => {
		const normalizedCurrent = String(currentWorkspaceId ?? "").trim();
		if (normalizedCurrent) return normalizedCurrent;
		for (const workspace of workspaces ?? []) {
			const workspaceId = String(workspace?.id ?? "").trim();
			if (workspaceId) return workspaceId;
		}
		return null;
	}, [currentWorkspaceId, workspaces]);

	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [expiresAtLocal, setExpiresAtLocal] = useState("");
	const [template, setTemplate] = useState<(typeof KEY_TEMPLATES)[number]["value"]>("read-only");
	const [loading, setLoading] = useState(false);
	const [plainKey, setPlainKey] = useState<string | null>(null);
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
		resolveInitialWorkspaceId()
	);
	const expiresAt = toIsoFromDateTimeLocalInput(expiresAtLocal);

	const missingContext = !currentUserId;
	const canCreate =
		!!name &&
		!loading &&
		!missingContext &&
		typeof selectedWorkspaceId === "string" &&
		selectedWorkspaceId.trim().length > 0;

	React.useEffect(() => {
		const nextWorkspaceId = resolveInitialWorkspaceId();
		if (nextWorkspaceId !== selectedWorkspaceId) {
			const timeoutId = window.setTimeout(() => {
				setSelectedWorkspaceId(nextWorkspaceId);
			}, 0);
			return () => window.clearTimeout(timeoutId);
		}
	}, [resolveInitialWorkspaceId, selectedWorkspaceId]);

	async function onCreate(e?: React.FormEvent) {
		e?.preventDefault();
		if (!name) return;
		if (
			!currentUserId ||
			typeof selectedWorkspaceId !== "string" ||
			selectedWorkspaceId.trim().length === 0
		) {
			setPlainKey(null);
			setLoading(false);
			toast.error(
				"Missing workspace context. Select a workspace in the header and try again.",
			);
			return;
		}
		try {
			setLoading(true);
			const res: any = await createManagementKeyAction({
				name,
				creatorUserId: currentUserId as string,
				workspaceId: selectedWorkspaceId,
				template,
				expiresAt,
			});
			setPlainKey(res?.plaintext ?? null);
		} catch (err: any) {
			const message =
				err?.message ??
				"Could not create management API key right now. Please try again.";
			toast.error(message);
		} finally {
			setLoading(false);
		}
	}

	function onClose() {
		setOpen(false);
		setName("");
		setExpiresAtLocal("");
		setTemplate("read-only");
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
					className="flex items-center"
				>
					<Plus className="h-4 w-4" />
					Create Key
				</Button>
			</DialogTrigger>

			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldAlert className="h-5 w-5 text-amber-600" />
						Create Management API Key
					</DialogTitle>
					<DialogDescription>
						Choose the minimum access this management API key needs.
					</DialogDescription>
					<DialogDescription className="mt-2 text-sm text-red-600">
						This key will be shown only <strong>once</strong> and grants
						elevated privileges. Store it securely.
					</DialogDescription>
				</DialogHeader>

				{!plainKey ? (
					<form onSubmit={onCreate} className="space-y-4">
						{workspaces && workspaces.length > 1 ? (
							<DropdownMenu>
								<DropdownMenuTrigger render={<Button
										variant="outline"
										size="sm"
										className="w-full flex items-center justify-between" />}>

										<span>
											{workspaces.find(
												(workspace) => workspace.id === selectedWorkspaceId
											)?.name || "Personal"}
										</span>
										<ChevronDown className="ml-2 h-4 w-4" />

								</DropdownMenuTrigger>
								<DropdownMenuContent
									side="bottom"
									align="start"
									className="w-full"
								>
									{workspaces.map((workspace) => (
										<DropdownMenuItem
											key={String(workspace.id ?? "__null")}
											onSelect={() =>
												setSelectedWorkspaceId(workspace.id ?? null)
											}
										>
											{workspace.name}
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
						<div className="space-y-2">
							<label id="management-key-template-label" className="text-sm font-medium">
								Access template
							</label>
							<div
								id="management-key-template"
								className="grid grid-cols-3 overflow-hidden rounded-md border border-input"
								role="group"
								aria-labelledby="management-key-template-label"
							>
								{KEY_TEMPLATES.map((option) => (
									<Button
										key={option.value}
										type="button"
										variant={template === option.value ? "default" : "ghost"}
										className="rounded-none text-xs"
										aria-pressed={template === option.value}
										onClick={() => setTemplate(option.value)}
									>
										{option.label}
									</Button>
								))}
							</div>
							<p className="text-xs text-muted-foreground">
								{KEY_TEMPLATES.find((option) => option.value === template)?.description}
							</p>
						</div>
						<div className="space-y-2">
							<Input
								type="datetime-local"
								value={expiresAtLocal}
								onChange={(e) => setExpiresAtLocal(e.target.value)}
								placeholder="Optional expiry"
							/>
							<p className="text-xs text-muted-foreground">
								Optional. Leave blank to keep this management key active until you revoke or pause it.
							</p>
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
						<div className="font-mono break-all select-all rounded-lg p-4 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700">
							{plainKey}
						</div>
						<div className="flex items-center gap-2">
							<div className="text-sm text-amber-700 dark:text-amber-400 font-bold">
								This key will not be shown again and grants elevated
								privileges. Keep this code secret at all times.
							</div>
						</div>
						<SecretRevealActions
							secret={plainKey}
							name={name || "AI Stats management API key"}
							kind="management-key"
							enableTest={false}
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

