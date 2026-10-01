"use client";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";
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
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";

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
	const t = useTranslations("SettingsUI");
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
	const invalidateSettings = useInvalidatePrivateSettings();
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
				t("strings.Missing workspace context. Select a workspace in the header and try again." as never),
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
			void invalidateSettings();
		} catch (err: unknown) {
			toast.error(
				localizedSettingsError(
					err,
					t,
					"Could not create management API key right now. Please try again.",
				),
			);
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
					{t("keys.createKey")}
				</Button>
			</DialogTrigger>

			<DialogContent className="gap-5 sm:max-w-lg">
				<DialogHeader className="gap-2">
					<DialogTitle className="flex items-center gap-2">
						<ShieldAlert className="h-5 w-5 text-amber-600" />
						{t("strings.Create Management API Key" as never)}
					</DialogTitle>
					<DialogDescription>
						{t("strings.Choose the minimum access this management API key needs." as never)}
					</DialogDescription>
					<p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm leading-5 text-amber-700 dark:text-amber-400">
						{t("keys.keyShownOnce")} <strong>{t("strings.once" as never)}</strong>{" "}
						{t("strings.and grants elevated privileges. Store it securely." as never)}
					</p>
				</DialogHeader>

				{!plainKey ? (
					<form onSubmit={onCreate} className="space-y-5">
						{workspaces && workspaces.length > 1 ? (
							<DropdownMenu>
								<DropdownMenuTrigger render={<Button
										variant="outline"
										size="sm"
										className="w-full flex items-center justify-between" />}>

										<span>
											{workspaces.find(
												(workspace) => workspace.id === selectedWorkspaceId
										)?.name || t("labels.personal")}
										</span>
										<ChevronDown className="ml-2 h-4 w-4" />

								</DropdownMenuTrigger>
								<DropdownMenuContent
									side="bottom"
									align="start"
									className="w-full rounded-lg"
								>
									{workspaces.map((workspace) => (
										<DropdownMenuItem
											key={String(workspace.id ?? "__null")}
											onClick={() =>
												setSelectedWorkspaceId(workspace.id ?? null)
											}
											className="rounded-lg"
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
							placeholder={t("strings.Key name (e.g. production management)" as never)}
						/>
						<div className="space-y-2">
							<label id="management-key-template-label" className="text-sm font-medium">
								{t("strings.Access template" as never)}
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
										{option.label === "All" ? t("strings.All" as never) : t(`labels.${option.label.toLowerCase()}` as never)}
									</Button>
								))}
							</div>
							<p className="text-xs text-muted-foreground">
								{template === "read-only" ? t("keys.readOnlyDescription") : template === "read-write" ? t("keys.readWriteDescription") : t("keys.fullControlDescription")}
							</p>
						</div>
						<div className="space-y-2">
							<Input
								type="datetime-local"
								value={expiresAtLocal}
								onChange={(e) => setExpiresAtLocal(e.target.value)}
							placeholder={t("keys.optionalExpiry")}
							/>
							<p className="text-xs text-muted-foreground">
								{t("strings.Optional. Leave blank to keep this management key active until you revoke or pause it." as never)}
							</p>
						</div>
						<DialogFooter>
							<DialogClose asChild>
								<Button
									type="button"
									variant="ghost"
									onClick={onClose}
								>
									{t("labels.cancel")}
								</Button>
							</DialogClose>
							<Button type="submit" disabled={!canCreate}>
								{loading ? t("labels.creating") : t("keys.createKey")}
							</Button>
						</DialogFooter>
					</form>
				) : (
					<div className="space-y-5">
						<div className="select-all break-all rounded-lg border border-amber-300 bg-amber-100/70 p-3 font-mono text-xs leading-5 dark:border-amber-700 dark:bg-amber-900/30 sm:text-sm">
							{plainKey}
						</div>
						<p className="text-sm leading-5 text-amber-700 dark:text-amber-400">
							{t("strings.This key will not be shown again and grants elevated privileges. Keep this code secret at all times." as never)}
						</p>
						<SecretRevealActions
							secret={plainKey}
							name={name || t("strings.AI Stats management API key" as never)}
							kind="management-key"
							enableTest={false}
						/>
						<DialogFooter className="pt-1">
							<DialogClose asChild>
								<Button onClick={onClose}>{t("labels.done")}</Button>
							</DialogClose>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
