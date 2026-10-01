"use client";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Edit2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
	updateManagementKeyAction,
	updateManagementKeyScopesAction,
	type ManagementKeyTemplate,
} from "@/app/(dashboard)/settings/management-api-keys/actions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MANAGEMENT_KEY_TEMPLATE_SCOPES } from "@/lib/managementKeyScopes";
import { useTranslations } from "next-intl";

const KEY_TEMPLATES: Array<{ value: ManagementKeyTemplate; label: string; description: string }> = [
	{ value: "read-only", label: "Read", description: "All control-plane reads." },
	{ value: "read-write", label: "Write", description: "Reads and changes, without deletes." },
	{ value: "full-control", label: "All", description: "All management capabilities." },
];

function templateForScopes(value: unknown): ManagementKeyTemplate | null {
	let rawScopes: unknown = value;
	if (typeof value === "string") {
		try {
			rawScopes = JSON.parse(value);
		} catch {
			rawScopes = value.split(/[\s,]+/);
		}
	}
	const scopes = Array.isArray(rawScopes) ? rawScopes.map(String).sort() : [];
	for (const [template, templateScopes] of Object.entries(MANAGEMENT_KEY_TEMPLATE_SCOPES) as Array<[ManagementKeyTemplate, string[]]>) {
		const expected = [...templateScopes].sort();
		if (scopes.length === expected.length && scopes.every((scope, index) => scope === expected[index])) {
			return template;
		}
	}
	return null;
}

function toDateTimeLocalInput(value: string | null): string {
	if (!value) return "";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "";
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoFromDateTimeLocalInput(value: string): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return null;
	return date.toISOString();
}

export default function EditManagementKeyItem({
	k,
	trigger = true,
	open: controlledOpen,
	onOpenChange,
}: {
	k: any;
	trigger?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const t = useTranslations("SettingsUI");
	const [open, setOpen] = useState(false);
	const invalidateSettings = useInvalidatePrivateSettings();
	const dialogOpen = controlledOpen ?? open;
	const setDialogOpen = onOpenChange ?? setOpen;
	const [name, setName] = useState(k.name || "");
	const [paused, setPaused] = useState(k.status !== "active");
	const [expiresAtLocal, setExpiresAtLocal] = useState(() =>
		toDateTimeLocalInput(
			typeof k?.expires_at === "string" ? k.expires_at : null
		)
	);
	const [loading, setLoading] = useState(false);
	const [template, setTemplate] = useState<ManagementKeyTemplate | null>(
		templateForScopes(k?.scopes),
	);
	const [templateChanged, setTemplateChanged] = useState(false);

	async function onSave(e?: React.FormEvent) {
		e?.preventDefault();
		setLoading(true);
		const updates = [
			updateManagementKeyAction(k.id, {
				name,
				paused,
				expiresAt: toIsoFromDateTimeLocalInput(expiresAtLocal),
			}),
		];
		if (templateChanged && template) {
			updates.push(updateManagementKeyScopesAction(k.id, template));
		}
		const promise = Promise.all(updates);
		try {
			await toast.promise(promise, {
					loading: t("strings.Saving management API key..." as never),
					success: t("strings.Management API key updated" as never),
				error: (err) => {
					const message =
							(err && (err as any).message) || t("strings.Failed to update key" as never);
					return message;
				},
			});
			await promise;
			setDialogOpen(false);
		} catch {
			// The toast reports the mutation error; keep the dialog open.
		} finally {
			await Promise.allSettled(updates);
			void invalidateSettings();
			setLoading(false);
		}
	}

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? (
				<DropdownMenuItem render={<div
						role="button"
						tabIndex={0}
						className="w-full text-left flex items-center gap-2"
						onClick={(e) => {
							e.preventDefault();
							setTimeout(() => setDialogOpen(true), 0);
						}} />}>

						<Edit2 className="mr-2" />
						{t("labels.edit")}

				</DropdownMenuItem>
			) : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldAlert className="h-5 w-5 text-amber-600" />
						{t("strings.Edit Management API Key" as never)}
					</DialogTitle>
					<DialogDescription>
					{t("strings.Update the lifecycle and access level for this elevated-privilege key." as never)}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSave} className="space-y-4">
					<Label>{t("keys.keyName")}</Label>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					<div className="space-y-2">
						<Label>{t("strings.Access level" as never)}</Label>
		<div className="grid grid-cols-3 overflow-hidden rounded-md border border-input" role="group" aria-label={t("strings.Management key access level" as never)}>
							{KEY_TEMPLATES.map((option) => (
								<Button
									key={option.value}
									type="button"
									variant={template === option.value ? "default" : "ghost"}
									className="rounded-none text-xs"
									aria-pressed={template === option.value}
									onClick={() => {
										setTemplate(option.value);
										setTemplateChanged(true);
									}}
								>
									{option.label === "All" ? t("strings.All" as never) : t(`labels.${option.label.toLowerCase()}` as never)}
								</Button>
							))}
						</div>
						<p className="text-xs text-muted-foreground">
							{template === "read-only" ? t("keys.readOnlyDescription") : template === "read-write" ? t("keys.readWriteDescription") : template === "full-control" ? t("keys.fullControlDescription") : t("strings.Custom scopes are preserved until you select a new access level." as never)}
						</p>
					</div>
					<div className="space-y-2">
						<Label>{t("keys.optionalExpiry")}</Label>
						<Input
							type="datetime-local"
							value={expiresAtLocal}
							onChange={(e) => setExpiresAtLocal(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							{t("strings.Optional. Clear this field to remove the expiry date." as never)}
						</p>
					</div>
					<div className="flex items-center justify-between">
						<div className="text-sm">{t("strings.Paused" as never)}</div>
						<Switch
							checked={paused}
							onCheckedChange={(v: any) => setPaused(Boolean(v))}
						/>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="ghost">{t("labels.cancel")}</Button>
						</DialogClose>
						<Button type="submit" disabled={loading}>
							{loading ? t("labels.saving") : t("labels.save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
