"use client";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
	updateRoutingSettings,
	type RoutingMode,
} from "@/app/(dashboard)/settings/routing/actions";
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";

type RoutingOption = {
	value: RoutingMode;
	label: string;
	description: string;
};

type PreviewKind = "active" | "beta" | "alpha";
type PreviewRow = {
	name: string;
	share: number;
	kind?: PreviewKind;
};

const ROUTING_OPTION_COPY = [
	{ value: "balanced", labelKey: "credits.Balanced", descriptionKey: "routingModeDescriptions.balanced" },
	{ value: "price", labelKey: "credits.Lowest cost", descriptionKey: "routingModeDescriptions.price" },
	{ value: "latency", labelKey: "credits.Lowest latency", descriptionKey: "routingModeDescriptions.latency" },
	{ value: "throughput", labelKey: "credits.Highest throughput", descriptionKey: "routingModeDescriptions.throughput" },
] as const;

const RESPONSE_HEALING_OPTION_COPY = [
	{ value: "safe", labelKey: "strings.Safe" },
	{ value: "strict", labelKey: "strings.Strict" },
] as const;

type Props = {
	initialMode?: RoutingMode | null;
	initialBetaChannelEnabled?: boolean;
	initialAlphaChannelEnabled?: boolean;
	initialResponseHealingEnabled?: boolean;
	initialResponseHealingLocked?: boolean;
	initialResponseHealingMode?: "safe" | "strict";
	teamName?: string | null;
};

const AUTO_SAVE_DEBOUNCE_MS = 650;

const PREVIEW_DISTRIBUTIONS: Record<RoutingMode, PreviewRow[]> = {
	balanced: [
		{ name: "OpenAI", share: 34, kind: "active" },
		{ name: "Anthropic", share: 29, kind: "active" },
		{ name: "Google", share: 22, kind: "active" },
		{ name: "Groq", share: 15, kind: "active" },
	],
	price: [
		{ name: "OpenAI", share: 18, kind: "active" },
		{ name: "Anthropic", share: 14, kind: "active" },
		{ name: "Google", share: 20, kind: "active" },
		{ name: "Groq", share: 48, kind: "active" },
	],
	latency: [
		{ name: "OpenAI", share: 24, kind: "active" },
		{ name: "Anthropic", share: 18, kind: "active" },
		{ name: "Google", share: 13, kind: "active" },
		{ name: "Groq", share: 45, kind: "active" },
	],
	throughput: [
		{ name: "OpenAI", share: 23, kind: "active" },
		{ name: "Anthropic", share: 35, kind: "active" },
		{ name: "Google", share: 27, kind: "active" },
		{ name: "Groq", share: 15, kind: "active" },
	],
};

function withCanaryTraffic(
	rows: PreviewRow[],
	betaEnabled: boolean,
	alphaEnabled: boolean,
): PreviewRow[] {
	if (!betaEnabled) return rows;
	const alphaShare = alphaEnabled ? 2 : 0;
	const betaShare = 5 - alphaShare;
	const totalCanaryShare = betaShare + alphaShare;
	const next: PreviewRow[] = rows.map((row, index) => ({
		...row,
		share: index === 0 ? Math.max(0, row.share - totalCanaryShare) : row.share,
	}));
	if (betaShare > 0) {
		next.push({ name: "Beta Pool", share: betaShare, kind: "beta" });
	}
	if (alphaShare > 0) {
		next.push({ name: "Alpha Pool", share: alphaShare, kind: "alpha" });
	}
	return next;
}

export default function RoutingSettingsClient({
	initialMode,
	initialBetaChannelEnabled,
	initialAlphaChannelEnabled,
	initialResponseHealingEnabled,
	initialResponseHealingLocked,
	initialResponseHealingMode,
	teamName,
}: Props) {
	const t = useTranslations("SettingsUI");
	const routingOptions: RoutingOption[] = ROUTING_OPTION_COPY.map((option) => ({
		value: option.value,
		label: t(option.labelKey as never),
		description: t(option.descriptionKey as never),
	}));
	const responseHealingOptions = RESPONSE_HEALING_OPTION_COPY.map((option) => ({
		value: option.value,
		label: t(option.labelKey as never),
	}));
	const invalidateSettings = useInvalidatePrivateSettings();
	const defaultMode = initialMode ?? "balanced";
	const defaultBeta = Boolean(initialBetaChannelEnabled);
	const defaultAlpha = defaultBeta && Boolean(initialAlphaChannelEnabled);
	const defaultResponseHealing = Boolean(initialResponseHealingEnabled);
	const defaultResponseHealingLocked = Boolean(initialResponseHealingLocked);
	const defaultResponseHealingMode =
		initialResponseHealingMode === "strict" ? "strict" : "safe";
	const [mode, setMode] = useState<RoutingMode>(defaultMode);
	const [betaChannelEnabled, setBetaChannelEnabled] = useState(defaultBeta);
	const [alphaChannelEnabled, setAlphaChannelEnabled] = useState(defaultAlpha);
	const [responseHealingEnabled, setResponseHealingEnabled] = useState(
		defaultResponseHealing,
	);
	const [responseHealingLocked, setResponseHealingLocked] = useState(
		defaultResponseHealingLocked,
	);
	const [responseHealingMode, setResponseHealingMode] = useState<"safe" | "strict">(
		defaultResponseHealingMode,
	);
	const [savedMode, setSavedMode] = useState<RoutingMode>(defaultMode);
	const [savedBeta, setSavedBeta] = useState(defaultBeta);
	const [savedAlpha, setSavedAlpha] = useState(defaultAlpha);
	const [savedResponseHealing, setSavedResponseHealing] = useState(
		defaultResponseHealing,
	);
	const [savedResponseHealingLocked, setSavedResponseHealingLocked] = useState(
		defaultResponseHealingLocked,
	);
	const [savedResponseHealingMode, setSavedResponseHealingMode] = useState(
		defaultResponseHealingMode,
	);
	const [saving, setSaving] = useState(false);
	const isFirstRun = useRef(true);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const saveSequenceRef = useRef(0);

	const activeOption = routingOptions.find((option) => option.value === mode);
	const previewRows = useMemo(
		() =>
			withCanaryTraffic(
				PREVIEW_DISTRIBUTIONS[mode],
				betaChannelEnabled,
				alphaChannelEnabled,
			),
		[mode, betaChannelEnabled, alphaChannelEnabled],
	);

	useEffect(() => {
		if (!betaChannelEnabled && alphaChannelEnabled) {
			setAlphaChannelEnabled(false);
		}
	}, [betaChannelEnabled, alphaChannelEnabled]);

	useEffect(() => {
		if (isFirstRun.current) {
			isFirstRun.current = false;
			return;
		}

		if (timerRef.current) {
			clearTimeout(timerRef.current);
		}

		timerRef.current = setTimeout(async () => {
		const saveSequence = ++saveSequenceRef.current;
		setSaving(true);
		try {
			const save = async () => {
				const result = await updateRoutingSettings({
					mode,
					betaChannelEnabled,
					alphaChannelEnabled,
					responseHealingEnabled,
					responseHealingLocked,
					responseHealingMode,
				});
				if (!result.ok) throw new Error(result.error);
				void invalidateSettings();
				return result;
			};
			const promise = save();
			toast.promise(
				promise,
				{
					loading: t("strings.Updating routing policy..." as never),
					success: (result) =>
						result.gatewayCacheInvalidated
							? t("strings.Routing policy updated" as never)
							: t("strings.Routing policy updated; gateway cache refresh pending" as never),
						error: (error) =>
							localizedSettingsError(error, t, "Failed to update routing policy"),
					},
				);
				await promise;
				if (saveSequence === saveSequenceRef.current) {
					setSavedMode(mode);
					setSavedBeta(betaChannelEnabled);
					setSavedAlpha(alphaChannelEnabled);
					setSavedResponseHealing(responseHealingEnabled);
					setSavedResponseHealingLocked(responseHealingLocked);
					setSavedResponseHealingMode(responseHealingMode);
				}
			} catch {
				// Keep unsaved state; the toast reports the failure.
			} finally {
				if (saveSequence === saveSequenceRef.current) {
					setSaving(false);
				}
			}
		}, AUTO_SAVE_DEBOUNCE_MS);

		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [
		invalidateSettings,
		mode,
		betaChannelEnabled,
		alphaChannelEnabled,
		responseHealingEnabled,
		responseHealingLocked,
		responseHealingMode,
	]);

	const isDirty =
		mode !== savedMode ||
		betaChannelEnabled !== savedBeta ||
		alphaChannelEnabled !== savedAlpha ||
		responseHealingEnabled !== savedResponseHealing ||
		responseHealingLocked !== savedResponseHealingLocked ||
		responseHealingMode !== savedResponseHealingMode;
	const stateText = saving
		? t("labels.saving")
		: isDirty
			? t("strings.Pending sync" as never)
			: t("strings.Synced" as never);

	function barTone(kind?: PreviewKind) {
		if (kind === "beta") return "bg-amber-500/80";
		if (kind === "alpha") return "bg-red-500/80";
		return "bg-primary";
	}

	function barTrackTone(kind?: PreviewKind) {
		if (kind === "beta") return "bg-amber-100/80";
		if (kind === "alpha") return "bg-red-100/80";
		return "bg-primary/10";
	}

	function barLabelTone(kind?: PreviewKind) {
		if (kind === "beta") return "text-amber-700 dark:text-amber-300";
		if (kind === "alpha") return "text-red-700 dark:text-red-300";
		return "text-foreground";
	}

	function subLabelTone(kind?: PreviewKind) {
		if (kind === "beta") return "text-amber-600 dark:text-amber-300";
		if (kind === "alpha") return "text-red-600 dark:text-red-300";
		return "text-muted-foreground";
	}

	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2 className="text-base font-semibold">{t("strings.Provider Routing" as never)}</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							{t("strings.Choose how the Gateway prioritizes providers" as never)}
							{teamName ? ` for ${teamName}` : " for this workspace"}.
						</p>
					</div>
					<Badge variant="outline" className="shrink-0 rounded-md font-normal">
						{stateText}
					</Badge>
				</div>

				<div className="overflow-hidden rounded-md border">
					<div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] sm:items-center">
						<div>
							<label htmlFor="routing-mode" className="text-sm font-medium">
								{t("strings.Routing Preference" as never)}
							</label>
							<p className="mt-1 text-sm text-muted-foreground">
								{activeOption?.description}
							</p>
						</div>
					<Select
						value={mode}
						items={routingOptions}
						onValueChange={(value) => setMode(value as RoutingMode)}
					>
						<SelectTrigger id="routing-mode" className="w-full rounded-md">
							<SelectValue placeholder={t("strings.Select a routing mode" as never)} />
						</SelectTrigger>
						<SelectContent>
							{routingOptions.map((option) => (
								<SelectItem
									key={option.value}
									value={option.value}
									label={option.label}
								>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					</div>
					<Separator />
					<div className="flex items-center justify-between gap-4 px-4 py-3">
						<div>
						<label htmlFor="beta-channel" className="text-sm font-medium">{t("strings.Beta Channel" as never)}</label>
						<p className="mt-1 text-sm text-muted-foreground">{t("strings.Include beta providers in a small share of production traffic." as never)}</p>
						</div>
						<Switch
							id="beta-channel"
							checked={betaChannelEnabled}
							onCheckedChange={setBetaChannelEnabled}
							aria-label={t("strings.Enable beta channel" as never)}
						/>
					</div>

				{betaChannelEnabled ? (
					<>
						<Separator />
						<div className="flex items-center justify-between gap-4 bg-muted/15 py-2.5 pl-8 pr-4">
							<div>
							<label htmlFor="alpha-channel" className="text-sm font-medium">{t("strings.Alpha Channel" as never)}</label>
							<p className="mt-1 text-sm text-muted-foreground">{t("strings.Include alpha providers within beta canary traffic." as never)}</p>
							</div>
							<Switch
								id="alpha-channel"
								checked={alphaChannelEnabled}
								onCheckedChange={setAlphaChannelEnabled}
								aria-label={t("strings.Enable alpha channel" as never)}
							/>
						</div>
					</>
				) : null}
				</div>
			</section>

			<section className="space-y-3">
				<div>
					<h2 className="text-base font-semibold">{t("strings.Response Healing" as never)}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("strings.Set the workspace default for repairing structured model output." as never)}</p>
				</div>
				<div className="overflow-hidden rounded-md border">
					<div className="flex items-center justify-between gap-4 px-4 py-3">
						<div>
							<label htmlFor="response-healing" className="text-sm font-medium">{t("strings.Enable by Default" as never)}</label>
							<p className="mt-1 text-sm text-muted-foreground">{t("strings.Repair compatible structured-output responses for this workspace." as never)}</p>
						</div>
						<Switch
							id="response-healing"
							checked={responseHealingEnabled}
							onCheckedChange={setResponseHealingEnabled}
							aria-label={t("strings.Enable default response healing" as never)}
						/>
					</div>
					<Separator />
					<div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] sm:items-center">
						<div>
							<label htmlFor="response-healing-mode" className="text-sm font-medium">{t("strings.Healing Mode" as never)}</label>
							<p className="mt-1 text-sm text-muted-foreground">
								{responseHealingMode === "strict"
									? t("strings.Only unwrap already-valid JSON from fences or surrounding text." as never)
									: t("strings.Apply bounded repairs such as trailing-comma cleanup and safe closer recovery." as never)}
							</p>
						</div>
						<Select
							value={responseHealingMode}
							items={responseHealingOptions}
							onValueChange={(value) =>
								setResponseHealingMode(value as "safe" | "strict")
							}
						>
							<SelectTrigger id="response-healing-mode" className="w-full rounded-md">
							<SelectValue placeholder={t("strings.Select a healing mode" as never)} />
							</SelectTrigger>
							<SelectContent>
								{responseHealingOptions.map((option) => (
									<SelectItem
										key={option.value}
										value={option.value}
										label={option.label}
									>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Separator />
					<div className="flex items-center justify-between gap-4 px-4 py-3">
						<div>
							<label htmlFor="response-healing-lock" className="text-sm font-medium">{t("strings.Lock Workspace Policy" as never)}</label>
							<p className="mt-1 text-sm text-muted-foreground">{t("strings.Prevent presets and requests from overriding this default." as never)}</p>
						</div>
						<Switch
							id="response-healing-lock"
							checked={responseHealingLocked}
							onCheckedChange={setResponseHealingLocked}
							aria-label={t("strings.Lock default response healing policy" as never)}
						/>
					</div>
				</div>
			</section>

			<section className="space-y-3">
				<div>
					<h2 className="text-base font-semibold">{t("strings.Routing Preview" as never)}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("strings.An illustrative distribution for the current policy. Live routing also considers compatibility, health, availability, and failover signals." as never)}</p>
				</div>
				<div className="rounded-md border px-4 py-3">
					<div className="space-y-3">
						{previewRows.map((row) => (
							<div key={row.name} className="space-y-1">
								<div className="flex items-center justify-between">
									<span
										className={`text-sm font-medium ${barLabelTone(
											row.kind,
										)}`}
									>
										{row.name}
									</span>
									<span
										className={`text-xs ${subLabelTone(
											row.kind,
										)}`}
									>
										{row.share.toFixed(0)}%
									</span>
								</div>
								<div
									className={`h-2 w-full overflow-hidden rounded-full ${barTrackTone(
										row.kind,
									)}`}
								>
									<div
										className={`h-full rounded-full transition-all duration-500 ease-out ${barTone(
											row.kind,
										)}`}
										style={{ width: `${row.share}%` }}
									/>
								</div>
							</div>
						))}
					</div>
				</div>
			</section>
		</div>
	);
}
