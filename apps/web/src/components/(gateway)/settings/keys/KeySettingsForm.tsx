"use client";

import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";
import { toast } from "sonner";

import {
	updateApiKeyAction,
	type KeyLimitPayload,
} from "@/app/(dashboard)/settings/keys/actions";
import { Button } from "@/components/ui/button";

import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { KeyIpAllowlistEditor, type KeyIpEntry } from "./KeyIpAllowlistEditor";

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
	const t = useTranslations("SettingsUI");
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
					placeholder={t("strings.Unlimited")}
					value={value}
					onChange={(event) => onChange(event.target.value)}
				/>
				{kind === "requests" ? (
					<InputGroupAddon align="inline-end">
						<InputGroupText>{t("oauthDetail.requests")}</InputGroupText>
					</InputGroupAddon>
				) : null}
			</InputGroup>
		</div>
	);
}

export default function KeySettingsForm({ k }: { k: any }) {
	const t = useTranslations("SettingsUI");
	const router = useRouter();
	const invalidateSettings = useInvalidatePrivateSettings();
	const [enabled, setEnabled] = useState(() => isKeyEnabled(k));
	const [limits, setLimits] = useState<LimitsForm>(() => initialLimits(k));
	const [ipAllowlist, setIpAllowlist] = useState<KeyIpEntry[]>(() => k.ip_allowlist ?? []);
	const [saving, setSaving] = useState(false);
	const dirty = useMemo(
		() =>
			enabled !== isKeyEnabled(k) ||
			JSON.stringify(limits) !== JSON.stringify(initialLimits(k)) ||
			JSON.stringify(ipAllowlist) !== JSON.stringify(k.ip_allowlist ?? []),
		[k, enabled, limits, ipAllowlist],
	);

	const updateLimit = (field: keyof LimitsForm, value: string) => {
		setLimits((current) => ({ ...current, [field]: value }));
	};

	async function onSave(event: React.FormEvent) {
		event.preventDefault();
		const limitPayload = buildLimitPayload(limits);
		if (!limitPayload) { toast.error(t("keyDetail.limitInvalid")); return; }

		setSaving(true);
		try {
			const promise = updateApiKeyAction(k.id, { ...(enabled !== isKeyEnabled(k) ? { paused: !enabled } : {}), ...(JSON.stringify(ipAllowlist) !== JSON.stringify(k.ip_allowlist ?? []) ? { ipAllowlist } : {}), limits: limitPayload });
			toast.promise(promise, {
					loading: t("strings.phraseSavingKey"),
					success: t("strings.Key updated"),
					error: (error) => error instanceof Error ? error.message : t("strings.Failed to update key"),
				},
			);
			await promise;
			void invalidateSettings();
			router.refresh();
		} catch {
			// The toast reports the failure; keep the unsaved form available.
		} finally {
			setSaving(false);
		}
	}

	return (
		<form id="settings" onSubmit={onSave} className="space-y-6 rounded-xl border bg-card p-6">
			<fieldset disabled={saving} className="space-y-6">
			<section className="space-y-4">
				<div className="text-sm font-medium">{t("strings.General")}</div>
				<div className="flex items-center justify-between gap-4">
					<div>
						<div className="text-sm font-medium">{t("labels.enabled")}</div>
						<div className="text-xs text-muted-foreground">{t("strings.phraseDisabledKeysCannotMakeGatewayRequests")}</div>
					</div>
					<Switch checked={enabled} onCheckedChange={setEnabled} aria-label={t("labels.enabled")} />
				</div>
			</section>

			<Separator />

			<section className="space-y-4">
				<div>
					<div className="text-sm font-medium">{t("strings.Limits")}</div>
					<div className="text-xs text-muted-foreground">{t("strings.phraseLeaveAFieldBlankForUnlimited")}</div>
				</div>
				<div className="grid gap-4 md:grid-cols-3">
					<LimitInput id="edit-key-daily-requests" label={t("keys.dailyRequests")} value={limits.dailyRequests} onChange={(value) => updateLimit("dailyRequests", value)} kind="requests" />
					<LimitInput id="edit-key-weekly-requests" label={t("keys.weeklyRequests")} value={limits.weeklyRequests} onChange={(value) => updateLimit("weeklyRequests", value)} kind="requests" />
					<LimitInput id="edit-key-monthly-requests" label={t("keys.monthlyRequests")} value={limits.monthlyRequests} onChange={(value) => updateLimit("monthlyRequests", value)} kind="requests" />
				</div>
				<div className="grid gap-4 md:grid-cols-3">
					<LimitInput id="edit-key-daily-spend" label={t("keys.dailySpend")} value={limits.dailyCostUsd} onChange={(value) => updateLimit("dailyCostUsd", value)} kind="spend" />
					<LimitInput id="edit-key-weekly-spend" label={t("keys.weeklySpend")} value={limits.weeklyCostUsd} onChange={(value) => updateLimit("weeklyCostUsd", value)} kind="spend" />
					<LimitInput id="edit-key-monthly-spend" label={t("keys.monthlySpend")} value={limits.monthlyCostUsd} onChange={(value) => updateLimit("monthlyCostUsd", value)} kind="spend" />
				</div>
			</section>

			<Separator />
			<KeyIpAllowlistEditor entries={ipAllowlist} onChange={setIpAllowlist} disabled={saving} />

			<div className="flex justify-end">
				<Button type="submit" disabled={saving || !dirty}>{saving ? t("strings.phraseSaving") : t("strings.Save Changes")}</Button>
			</div>
			</fieldset>
		</form>
	);
}
