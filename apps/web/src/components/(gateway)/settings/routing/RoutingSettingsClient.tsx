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

const ROUTING_OPTIONS: RoutingOption[] = [
	{
		value: "balanced",
		label: "Balanced",
		description: "Blend success rate, latency, throughput, and load.",
	},
	{
		value: "price",
		label: "Lowest cost",
		description: "Prefer the cheapest compatible provider when possible.",
	},
	{
		value: "latency",
		label: "Lowest latency",
		description: "Bias toward the fastest provider for your model.",
	},
	{
		value: "throughput",
		label: "Highest throughput",
		description: "Route to providers with the most recent capacity.",
	},
];

const RESPONSE_HEALING_OPTIONS = [
	{ value: "safe", label: "Safe" },
	{ value: "strict", label: "Strict" },
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

	const activeOption = useMemo(
		() => ROUTING_OPTIONS.find((opt) => opt.value === mode),
		[mode]
	);
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
					loading: "Updating routing policy...",
					success: (result) =>
						result.gatewayCacheInvalidated
							? "Routing policy updated"
							: "Routing policy updated; gateway cache refresh pending",
						error: (error) =>
							error instanceof Error && error.message
								? `Failed to update routing policy: ${error.message}`
								: "Failed to update routing policy",
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
		? "Saving..."
		: isDirty
			? "Pending sync"
			: "Synced";

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
						<h2 className="text-base font-semibold">Provider Routing</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Choose how the Gateway prioritizes providers
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
								Routing Preference
							</label>
							<p className="mt-1 text-sm text-muted-foreground">
								{activeOption?.description}
							</p>
						</div>
					<Select
						value={mode}
						items={ROUTING_OPTIONS}
						onValueChange={(value) => setMode(value as RoutingMode)}
					>
						<SelectTrigger id="routing-mode" className="w-full rounded-md">
							<SelectValue placeholder="Select a routing mode" />
						</SelectTrigger>
						<SelectContent>
							{ROUTING_OPTIONS.map((option) => (
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
							<label htmlFor="beta-channel" className="text-sm font-medium">Beta Channel</label>
							<p className="mt-1 text-sm text-muted-foreground">Include beta providers in a small share of production traffic.</p>
						</div>
						<Switch
							id="beta-channel"
							checked={betaChannelEnabled}
							onCheckedChange={setBetaChannelEnabled}
							aria-label="Enable beta channel"
						/>
					</div>

				{betaChannelEnabled ? (
					<>
						<Separator />
						<div className="flex items-center justify-between gap-4 bg-muted/15 py-2.5 pl-8 pr-4">
							<div>
								<label htmlFor="alpha-channel" className="text-sm font-medium">Alpha Channel</label>
								<p className="mt-1 text-sm text-muted-foreground">Include alpha providers within beta canary traffic.</p>
							</div>
							<Switch
								id="alpha-channel"
								checked={alphaChannelEnabled}
								onCheckedChange={setAlphaChannelEnabled}
								aria-label="Enable alpha channel"
							/>
						</div>
					</>
				) : null}
				</div>
			</section>

			<section className="space-y-3">
				<div>
					<h2 className="text-base font-semibold">Response Healing</h2>
					<p className="mt-1 text-sm text-muted-foreground">Set the workspace default for repairing structured model output.</p>
				</div>
				<div className="overflow-hidden rounded-md border">
					<div className="flex items-center justify-between gap-4 px-4 py-3">
						<div>
							<label htmlFor="response-healing" className="text-sm font-medium">Enable by Default</label>
							<p className="mt-1 text-sm text-muted-foreground">Repair compatible structured-output responses for this workspace.</p>
						</div>
						<Switch
							id="response-healing"
							checked={responseHealingEnabled}
							onCheckedChange={setResponseHealingEnabled}
							aria-label="Enable default response healing"
						/>
					</div>
					<Separator />
					<div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] sm:items-center">
						<div>
							<label htmlFor="response-healing-mode" className="text-sm font-medium">Healing Mode</label>
							<p className="mt-1 text-sm text-muted-foreground">
								{responseHealingMode === "strict"
									? "Only unwrap already-valid JSON from fences or surrounding text."
									: "Apply bounded repairs such as trailing-comma cleanup and safe closer recovery."}
							</p>
						</div>
						<Select
							value={responseHealingMode}
							items={RESPONSE_HEALING_OPTIONS}
							onValueChange={(value) =>
								setResponseHealingMode(value as "safe" | "strict")
							}
						>
							<SelectTrigger id="response-healing-mode" className="w-full rounded-md">
								<SelectValue placeholder="Select a healing mode" />
							</SelectTrigger>
							<SelectContent>
								{RESPONSE_HEALING_OPTIONS.map((option) => (
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
							<label htmlFor="response-healing-lock" className="text-sm font-medium">Lock Workspace Policy</label>
							<p className="mt-1 text-sm text-muted-foreground">Prevent presets and requests from overriding this default.</p>
						</div>
						<Switch
							id="response-healing-lock"
							checked={responseHealingLocked}
							onCheckedChange={setResponseHealingLocked}
							aria-label="Lock default response healing policy"
						/>
					</div>
				</div>
			</section>

			<section className="space-y-3">
				<div>
					<h2 className="text-base font-semibold">Routing Preview</h2>
					<p className="mt-1 text-sm text-muted-foreground">An illustrative distribution for the current policy. Live routing also considers compatibility, health, availability, and failover signals.</p>
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
