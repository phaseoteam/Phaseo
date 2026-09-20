"use client";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";

import React, { useMemo, useState } from "react";
import { Edit2 } from "lucide-react";
import { toast } from "sonner";

import {
	updateApiKeyAction,
	updateKeyLimitsAction,
	type KeyLimitPayload,
} from "@/app/(dashboard)/settings/keys/actions";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

const NANOS_PER_USD = 1_000_000_000;

type LimitsForm = {
	dailyRequests: string;
	weeklyRequests: string;
	monthlyRequests: string;
	dailyCostUsd: string;
	weeklyCostUsd: string;
	monthlyCostUsd: string;
};

function formatPositiveNumber(value: unknown) {
	const number = Number(value ?? 0);
	return Number.isFinite(number) && number > 0 ? String(number) : "";
}

function formatUsd(value: unknown) {
	const number = Number(value ?? 0);
	return Number.isFinite(number) && number > 0
		? String(number / NANOS_PER_USD)
		: "";
}

function initialLimits(key: any): LimitsForm {
	return {
		dailyRequests: formatPositiveNumber(key?.daily_limit_requests),
		weeklyRequests: formatPositiveNumber(key?.weekly_limit_requests),
		monthlyRequests: formatPositiveNumber(key?.monthly_limit_requests),
		dailyCostUsd: formatUsd(key?.daily_limit_cost_nanos),
		weeklyCostUsd: formatUsd(key?.weekly_limit_cost_nanos),
		monthlyCostUsd: formatUsd(key?.monthly_limit_cost_nanos),
	};
}

function parseInteger(value: string): number | null | undefined {
	if (!value.trim()) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return undefined;
	return Math.floor(parsed);
}

function parseUsd(value: string): number | null | undefined {
	if (!value.trim()) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return undefined;
	return Math.round(parsed * NANOS_PER_USD);
}

function buildLimitPayload(form: LimitsForm): KeyLimitPayload | null {
	const values = {
		dailyRequests: parseInteger(form.dailyRequests),
		weeklyRequests: parseInteger(form.weeklyRequests),
		monthlyRequests: parseInteger(form.monthlyRequests),
		dailyCostNanos: parseUsd(form.dailyCostUsd),
		weeklyCostNanos: parseUsd(form.weeklyCostUsd),
		monthlyCostNanos: parseUsd(form.monthlyCostUsd),
	};
	const invalid = Object.values(values).some((value) => value === undefined);
	if (invalid) {
		toast.error("Limits must be zero or a positive number.");
		return null;
	}
	return values as KeyLimitPayload;
}

function isKeyEnabled(key: any) {
	return !["paused", "disabled", "revoked"].includes(
		String(key?.status ?? "").toLowerCase(),
	);
}

function LimitInput({
	id,
	label,
	value,
	onChange,
	kind,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	kind: "requests" | "spend";
}) {
	return (
		<div className="min-w-0 space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<InputGroup>
				{kind === "spend" ? (
					<InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
				) : null}
				<InputGroupInput
					id={id}
					type="number"
					min="0"
					step={kind === "spend" ? "0.01" : "1"}
					placeholder="Unlimited"
					value={value}
					onChange={(event) => onChange(event.target.value)}
				/>
				{kind === "requests" ? (
					<InputGroupAddon align="inline-end">
						<InputGroupText>req</InputGroupText>
					</InputGroupAddon>
				) : null}
			</InputGroup>
		</div>
	);
}

export default function EditKeyItem({
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
	const [internalOpen, setInternalOpen] = useState(false);
	const invalidateSettings = useInvalidatePrivateSettings();
	const open = controlledOpen ?? internalOpen;
	const setOpen = onOpenChange ?? setInternalOpen;
	const [name, setName] = useState(String(k?.name ?? ""));
	const [enabled, setEnabled] = useState(() => isKeyEnabled(k));
	const [limits, setLimits] = useState<LimitsForm>(() => initialLimits(k));
	const [saving, setSaving] = useState(false);
	const dirty = useMemo(
		() =>
			name.trim() !== String(k?.name ?? "").trim() ||
			enabled !== isKeyEnabled(k) ||
			JSON.stringify(limits) !== JSON.stringify(initialLimits(k)),
		[k, name, enabled, limits],
	);

	const updateLimit = (field: keyof LimitsForm, value: string) => {
		setLimits((current) => ({ ...current, [field]: value }));
	};

	async function onSave(event: React.FormEvent) {
		event.preventDefault();
		const trimmedName = name.trim();
		if (!trimmedName) {
			toast.error("Key name is required.");
			return;
		}
		const limitPayload = buildLimitPayload(limits);
		if (!limitPayload) return;

		setSaving(true);
		const updates = [
			updateApiKeyAction(k.id, { name: trimmedName, paused: !enabled }),
			updateKeyLimitsAction(k.id, limitPayload),
		];
		const promise = Promise.all(updates);
		try {
			await toast.promise(
				promise,
				{
					loading: "Saving key...",
					success: "Key updated",
					error: (error) => error instanceof Error ? error.message : "Failed to update key",
				},
			);
			await promise;
			setOpen(false);
		} catch {
			// The toast reports the mutation error; keep the dialog open.
		} finally {
			await Promise.allSettled(updates);
			void invalidateSettings();
			setSaving(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{trigger ? (
				<DropdownMenuItem render={<div className="flex w-full items-center gap-2 text-left" onClick={() => setTimeout(() => setOpen(true), 0)} />}>
					<Edit2 className="mr-2 size-4" />
					Edit
				</DropdownMenuItem>
			) : null}
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[36rem]">
				<DialogHeader>
					<DialogTitle>Edit API Key</DialogTitle>
					<DialogDescription>
						Manage the key name, availability, and usage limits.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSave} className="space-y-6">
					<section className="space-y-4">
						<div className="text-sm font-medium">General</div>
						<div className="space-y-2">
							<Label htmlFor={`key-name-${k.id}`}>Key Name</Label>
							<Input id={`key-name-${k.id}`} value={name} onChange={(event) => setName(event.target.value)} />
						</div>
						<div className="flex items-center justify-between gap-4">
							<div>
								<div className="text-sm font-medium">Enabled</div>
								<div className="text-xs text-muted-foreground">Disabled keys cannot make gateway requests.</div>
							</div>
							<Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Key enabled" />
						</div>
					</section>

					<Separator />

					<section className="space-y-4">
						<div>
							<div className="text-sm font-medium">Limits</div>
							<div className="text-xs text-muted-foreground">Leave a field blank for unlimited.</div>
						</div>
						<div className="grid gap-4 md:grid-cols-3">
							<LimitInput id="edit-key-daily-requests" label="Daily Requests" value={limits.dailyRequests} onChange={(value) => updateLimit("dailyRequests", value)} kind="requests" />
							<LimitInput id="edit-key-weekly-requests" label="Weekly Requests" value={limits.weeklyRequests} onChange={(value) => updateLimit("weeklyRequests", value)} kind="requests" />
							<LimitInput id="edit-key-monthly-requests" label="Monthly Requests" value={limits.monthlyRequests} onChange={(value) => updateLimit("monthlyRequests", value)} kind="requests" />
						</div>
						<div className="grid gap-4 md:grid-cols-3">
							<LimitInput id="edit-key-daily-spend" label="Daily Spend" value={limits.dailyCostUsd} onChange={(value) => updateLimit("dailyCostUsd", value)} kind="spend" />
							<LimitInput id="edit-key-weekly-spend" label="Weekly Spend" value={limits.weeklyCostUsd} onChange={(value) => updateLimit("weeklyCostUsd", value)} kind="spend" />
							<LimitInput id="edit-key-monthly-spend" label="Monthly Spend" value={limits.monthlyCostUsd} onChange={(value) => updateLimit("monthlyCostUsd", value)} kind="spend" />
						</div>
					</section>

					<DialogFooter>
						<DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
						<Button type="submit" disabled={saving || !dirty}>{saving ? "Saving..." : "Save Changes"}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
