"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
	removeSuccessorReplacement,
	saveSuccessorReplacement,
	updateSuccessorRouting,
	type SuccessorPricePolicy,
} from "@/app/(dashboard)/settings/routing/actions";
import { useSettingsWrite, withPrivateSettings } from "../PrivateSettingsQuery";

export type SuccessorRoutingData = {
	canManage: boolean;
	enabled: boolean;
	pricePolicy: SuccessorPricePolicy;
	maxPriceIncreasePercent: number;
	replacements: Array<{ model: string; successor: string | null; updatedAt: string | null }>;
	workspaceId: string;
};

type ActionResult = { ok: true } | { ok: false; status: number; code?: string | null };

const NEVER = "never";
const REPLACEMENT_ERRORS = new Set(["unknown_model", "unknown_successor", "inactive_successor", "successor_is_model", "invalid_model", "invalid_successor", "too_many_replacements"]);

function ModelSuccessorRoutingSettings({ initialData }: { initialData: SuccessorRoutingData }) {
	const t = useTranslations("SettingsUI.modelSuccessorRouting");
	const write = useSettingsWrite();
	const [isPending, startTransition] = useTransition();
	const [enabled, setEnabled] = useState(initialData.enabled);
	const [pricePolicy, setPricePolicy] = useState<SuccessorPricePolicy>(initialData.pricePolicy);
	const [percent, setPercent] = useState(String(initialData.pricePolicy === "limit" ? initialData.maxPriceIncreasePercent : 25));
	const [replacements, setReplacements] = useState(initialData.replacements);
	const [model, setModel] = useState("");
	const [successor, setSuccessor] = useState("");
	const disabled = !initialData.canManage || isPending;
	const percentValue = Number(percent);
	const percentValid = pricePolicy !== "limit" || (Number.isInteger(percentValue) && percentValue >= 0 && percentValue <= 1000);
	const priceOptions = [
		{ value: "never", label: t("priceNever") },
		{ value: "limit", label: t("priceLimit") },
		{ value: "any", label: t("priceAny") },
	];

	const report = (result: ActionResult, success: string) => {
		if (result.ok) {
			toast.success(success);
			return true;
		}
		const code = "code" in result ? result.code : null;
		toast.error(code && REPLACEMENT_ERRORS.has(code) ? t(`errors.${code}` as never) : result.status === 403 ? t("errors.forbidden") : t("errors.saveFailed"));
		return false;
	};

	const saveSettings = () => startTransition(async () => {
		const result = await write(updateSuccessorRouting({
			enabled,
			pricePolicy,
			maxPriceIncreasePercent: pricePolicy === "limit" ? percentValue : 0,
		}));
		report(result, t("saved"));
	});

	const addReplacement = () => startTransition(async () => {
		const target = successor.trim().toLowerCase();
		const entry = { model: model.trim().toLowerCase(), successor: target === "" || target === NEVER ? null : target };
		const result = await write(saveSuccessorReplacement(entry));
		if (!report(result, t("replacementSaved"))) return;
		setReplacements((rows) => [...rows.filter((row) => row.model !== entry.model), { ...entry, updatedAt: new Date().toISOString() }]
			.sort((a, b) => a.model.localeCompare(b.model)));
		setModel("");
		setSuccessor("");
	});

	const removeReplacement = (slug: string) => startTransition(async () => {
		const result = await write(removeSuccessorReplacement(slug));
		if (report(result, t("replacementRemoved"))) setReplacements((rows) => rows.filter((row) => row.model !== slug));
	});

	return (
		<section className="space-y-3">
			<div>
				<h2 className="text-base font-semibold">{t("title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
			</div>
			<div className="overflow-hidden rounded-md border">
				<div className="flex items-center justify-between gap-4 px-4 py-3">
					<div>
						<label htmlFor="model-successor-redirect" className="text-sm font-medium">{t("enable")}</label>
						<p className="mt-1 text-sm text-muted-foreground">{t("enableDescription")}</p>
					</div>
					<Switch id="model-successor-redirect" checked={enabled} onCheckedChange={setEnabled} disabled={disabled} aria-label={t("enable")} />
				</div>
				<Separator />
				<div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] sm:items-center">
					<div>
						<label htmlFor="model-successor-price" className="text-sm font-medium">{t("price")}</label>
						<p className="mt-1 text-sm text-muted-foreground">{t("priceDescription")}</p>
					</div>
					<div className="flex gap-2">
						<Select value={pricePolicy} items={priceOptions} onValueChange={(value) => setPricePolicy(value as SuccessorPricePolicy)} disabled={disabled}>
							<SelectTrigger id="model-successor-price" className="w-full rounded-md">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{priceOptions.map((option) => (
									<SelectItem key={option.value} value={option.value} label={option.label}>{option.label}</SelectItem>
								))}
							</SelectContent>
						</Select>
						{pricePolicy === "limit" ? (
							<Input
								type="number"
								min={0}
								max={1000}
								step={1}
								inputMode="numeric"
								className="w-24"
								value={percent}
								onChange={(event) => setPercent(event.target.value)}
								disabled={disabled}
								aria-label={t("percent")}
								aria-invalid={!percentValid}
							/>
						) : null}
					</div>
				</div>
				<Separator />
				<div className="flex items-center justify-between gap-4 px-4 py-3">
					<p className="text-sm text-muted-foreground">{initialData.canManage ? t("delayNotice") : t("adminsOnly")}</p>
					<Button type="button" onClick={saveSettings} disabled={disabled || !percentValid}>{t("save")}</Button>
				</div>
			</div>

			<div className="overflow-hidden rounded-md border">
				<div className="px-4 py-3">
					<h3 className="text-sm font-medium">{t("replacements")}</h3>
					<p className="mt-1 text-sm text-muted-foreground">{t("replacementsDescription")}</p>
				</div>
				<Separator />
				{replacements.length ? (
					<ul className="divide-y">
						{replacements.map((row) => (
							<li key={row.model} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
								<span className="font-mono text-xs">{row.model}</span>
								<span className="text-muted-foreground">→</span>
								<span className="font-mono text-xs">{row.successor ?? t("neverRedirect")}</span>
								<Button type="button" variant="ghost" size="sm" onClick={() => removeReplacement(row.model)} disabled={disabled}>
									{t("remove")}
								</Button>
							</li>
						))}
					</ul>
				) : (
					<p className="px-4 py-3 text-sm text-muted-foreground">{t("noReplacements")}</p>
				)}
				<Separator />
				<div className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_auto]">
					<Input value={model} onChange={(event) => setModel(event.target.value)} placeholder={t("modelPlaceholder")} aria-label={t("model")} disabled={disabled} />
					<Input value={successor} onChange={(event) => setSuccessor(event.target.value)} placeholder={t("successorPlaceholder")} aria-label={t("successor")} disabled={disabled} />
					<Button type="button" variant="outline" onClick={addReplacement} disabled={disabled || !model.trim()}>{t("add")}</Button>
				</div>
			</div>
		</section>
	);
}

export default withPrivateSettings<SuccessorRoutingData>("/api/account/settings/routing/successor", ModelSuccessorRoutingSettings);
