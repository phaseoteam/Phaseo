"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { updateBetaChannelEnabled, updateRoutingMode, type RoutingMode } from "@/app/(dashboard)/settings/routing/actions";

type RoutingOption = {
	value: RoutingMode;
	label: string;
	description: string;
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

type Props = {
	initialMode?: RoutingMode | null;
	initialBetaChannelEnabled?: boolean | null;
	teamName?: string | null;
};

type SignalWeights = {
	reliability: number;
	latency: number;
	throughput: number;
	price: number;
};

const MODE_WEIGHTS: Record<RoutingMode, SignalWeights> = {
	balanced: { reliability: 0.35, latency: 0.5, throughput: 0.1, price: 0 },
	price: { reliability: 0.25, latency: 0.25, throughput: 0.05, price: 0.4 },
	latency: { reliability: 0.25, latency: 0.7, throughput: 0.02, price: 0 },
	throughput: { reliability: 0.2, latency: 0.3, throughput: 0.4, price: 0 },
};

const SIGNALS = [
	{ key: "reliability", label: "Reliability", className: "bg-emerald-500" },
	{ key: "latency", label: "Latency", className: "bg-sky-500" },
	{ key: "throughput", label: "Throughput", className: "bg-amber-500" },
	{ key: "price", label: "Price", className: "bg-fuchsia-500" },
] as const;

function normalizeSignals(weights: SignalWeights) {
	const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
	return Object.fromEntries(
		Object.entries(weights).map(([key, value]) => [key, (value / total) * 100])
	) as Record<keyof SignalWeights, number>;
}

export default function RoutingSettingsClient({ initialMode, initialBetaChannelEnabled, teamName }: Props) {
	const defaultMode = initialMode ?? "balanced";
	const [mode, setMode] = useState<RoutingMode>(defaultMode);
	const [savedMode, setSavedMode] = useState<RoutingMode>(defaultMode);
	const [saving, setSaving] = useState(false);
	const latestModeRef = useRef(mode);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const initialBetaEnabled = Boolean(initialBetaChannelEnabled);
	const [betaEnabled, setBetaEnabled] = useState(initialBetaEnabled);
	const [savedBetaEnabled, setSavedBetaEnabled] = useState(initialBetaEnabled);
	const [savingBeta, setSavingBeta] = useState(false);
	const latestBetaRef = useRef(betaEnabled);
	const betaSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const activeOption = useMemo(
		() => ROUTING_OPTIONS.find((opt) => opt.value === mode),
		[mode]
	);
	const signalWeights = useMemo(
		() => normalizeSignals(MODE_WEIGHTS[mode]),
		[mode]
	);
	const isDirty = mode !== savedMode;
	const betaDirty = betaEnabled !== savedBetaEnabled;
	const savingAny = saving || savingBeta;
	const pendingSave = isDirty || betaDirty;

	useEffect(() => {
		latestModeRef.current = mode;
	}, [mode]);

	useEffect(() => {
		latestBetaRef.current = betaEnabled;
	}, [betaEnabled]);

	useEffect(() => {
		if (!isDirty) return;
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}
		const targetMode = mode;
		saveTimeoutRef.current = setTimeout(async () => {
			try {
				setSaving(true);
				await toast.promise(updateRoutingMode(targetMode), {
					loading: "Saving routing policy...",
					success: "Routing policy updated",
					error: "Failed to update routing policy",
				});
				if (latestModeRef.current === targetMode) {
					setSavedMode(targetMode);
				}
			} finally {
				setSaving(false);
			}
		}, 450);

		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, [isDirty, mode]);

	useEffect(() => {
		if (!betaDirty) return;
		if (betaSaveTimeoutRef.current) {
			clearTimeout(betaSaveTimeoutRef.current);
		}
		const targetEnabled = betaEnabled;
		betaSaveTimeoutRef.current = setTimeout(async () => {
			try {
				setSavingBeta(true);
				await toast.promise(updateBetaChannelEnabled(targetEnabled), {
					loading: "Saving beta channel...",
					success: "Beta channel updated",
					error: "Failed to update beta channel",
				});
				if (latestBetaRef.current === targetEnabled) {
					setSavedBetaEnabled(targetEnabled);
				}
			} finally {
				setSavingBeta(false);
			}
		}, 450);

		return () => {
			if (betaSaveTimeoutRef.current) {
				clearTimeout(betaSaveTimeoutRef.current);
			}
		};
	}, [betaDirty, betaEnabled]);

	return (
		<Card>
			<CardContent className="space-y-6 p-6">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">Routing policy</h2>
					<p className="text-sm text-muted-foreground">
						Controls how the Gateway prioritizes providers for the active team
						{teamName ? ` (${teamName})` : ""}.
					</p>
				</div>

				<div className="grid gap-3 md:grid-cols-[240px_1fr] md:items-center">
					<label htmlFor="routing-mode" className="text-sm font-medium">
						Preference
					</label>
					<div className="space-y-1">
						<Select
							value={mode}
							onValueChange={(value) => setMode(value as RoutingMode)}
						>
							<SelectTrigger id="routing-mode" className="max-w-sm">
								<SelectValue placeholder="Select a routing mode" />
							</SelectTrigger>
							<SelectContent>
								{ROUTING_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							Auto-saves on change{saving ? "..." : "."}
						</p>
					</div>
				</div>

				<div className="rounded-lg border bg-muted/30 p-4">
					<p className="text-sm font-medium">{activeOption?.label}</p>
					<p className="text-sm text-muted-foreground">
						{activeOption?.description}
					</p>
				</div>

				<div className="rounded-lg border border-amber-200/60 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/40 p-4">
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-1">
							<p className="text-sm font-semibold">Beta provider access</p>
							<p className="text-xs text-muted-foreground">
								Opt in to alpha-stage providers for this team. This is not
								production-ready and may produce frequent errors or instability.
							</p>
						</div>
						<Switch checked={betaEnabled} onCheckedChange={setBetaEnabled} />
					</div>
					<p className="mt-3 text-[11px] text-muted-foreground">
						Enables alpha routing (1%) and cache-sticky routing hints for 5 minutes
						when cached tokens are returned.
					</p>
				</div>

				<div className="rounded-lg border bg-white/80 dark:bg-zinc-950/60 p-4 space-y-3">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm font-medium">Routing mix preview</p>
							<p className="text-xs text-muted-foreground">
								Signals are blended per request. Load and token affinity still apply.
							</p>
						</div>
						<span className="text-xs text-muted-foreground">Illustrative</span>
					</div>
					<div className="h-3 w-full overflow-hidden rounded-full bg-muted">
						<div className="flex h-full w-full">
							{SIGNALS.map((signal) => {
								const width = signalWeights[signal.key];
								if (!width) return null;
								return (
									<div
										key={signal.key}
										className={`${signal.className} transition-[width] duration-500 ease-out`}
										style={{ width: `${width}%` }}
									/>
								);
							})}
						</div>
					</div>
					<div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
						{SIGNALS.map((signal) => (
							<div key={signal.key} className="flex items-center gap-2">
								<span className={`h-2 w-2 rounded-full ${signal.className}`} />
								<span>{signal.label}</span>
								<span className="ml-auto text-foreground">
									<span className="transition-opacity duration-300 ease-out">
										{Math.round(signalWeights[signal.key])}%
									</span>
								</span>
							</div>
						))}
					</div>
					<p className="text-[11px] text-muted-foreground">
						Illustrative only. The Gateway also considers health, availability,
						rate limits, and model fit on each request.
					</p>
				</div>

				<div className="flex justify-end text-xs text-muted-foreground">
					{savingAny ? "Saving..." : pendingSave ? "Pending save..." : "Saved"}
				</div>
			</CardContent>
		</Card>
	);
}
