"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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

type PreviewKind = "active" | "beta";
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

type Props = {
	initialMode?: RoutingMode | null;
	initialBetaChannelEnabled?: boolean;
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

function withBetaTraffic(rows: PreviewRow[], enabled: boolean): PreviewRow[] {
	if (!enabled) return rows;
	const betaShare = 5;
	const next: PreviewRow[] = rows.map((row, index) => ({
		...row,
		share: index === 0 ? Math.max(0, row.share - betaShare) : row.share,
	}));
	return [...next, { name: "Beta Pool", share: betaShare, kind: "beta" }];
}

export default function RoutingSettingsClient({
	initialMode,
	initialBetaChannelEnabled,
	teamName,
}: Props) {
	const defaultMode = initialMode ?? "balanced";
	const defaultBeta = Boolean(initialBetaChannelEnabled);
	const [mode, setMode] = useState<RoutingMode>(defaultMode);
	const [betaChannelEnabled, setBetaChannelEnabled] = useState(defaultBeta);
	const [savedMode, setSavedMode] = useState<RoutingMode>(defaultMode);
	const [savedBeta, setSavedBeta] = useState(defaultBeta);
	const [saving, setSaving] = useState(false);
	const isFirstRun = useRef(true);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const saveSequenceRef = useRef(0);

	const activeOption = useMemo(
		() => ROUTING_OPTIONS.find((opt) => opt.value === mode),
		[mode]
	);
	const previewRows = useMemo(
		() => withBetaTraffic(PREVIEW_DISTRIBUTIONS[mode], betaChannelEnabled),
		[mode, betaChannelEnabled],
	);

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
				await toast.promise(
					updateRoutingSettings({
						mode,
						betaChannelEnabled,
					}),
					{
						loading: "Updating routing policy...",
						success: "Routing policy updated",
						error: "Failed to update routing policy",
					},
				);
				if (saveSequence === saveSequenceRef.current) {
					setSavedMode(mode);
					setSavedBeta(betaChannelEnabled);
				}
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
	}, [mode, betaChannelEnabled]);

	const isDirty = mode !== savedMode || betaChannelEnabled !== savedBeta;
	const stateText = saving
		? "Saving..."
		: isDirty
			? "Pending sync"
			: "Synced";

	function barTone(kind?: "active" | "beta") {
		if (kind === "beta") return "bg-amber-500/80";
		return "bg-primary";
	}

	function barTrackTone(kind?: "active" | "beta") {
		if (kind === "beta") return "bg-amber-100/80";
		return "bg-primary/10";
	}

	function barLabelTone(kind?: "active" | "beta") {
		if (kind === "beta") return "text-amber-700 dark:text-amber-300";
		return "text-foreground";
	}

	function subLabelTone(kind?: "active" | "beta") {
		if (kind === "beta") return "text-amber-600 dark:text-amber-300";
		return "text-muted-foreground";
	}

	return (
		<Card>
			<CardContent className="space-y-6 p-6">
				<div className="space-y-1">
					<div className="flex items-center justify-between gap-3">
						<h2 className="text-lg font-semibold">Routing policy</h2>
						<span className="text-xs text-muted-foreground">
							{stateText}
						</span>
					</div>
					<p className="text-sm text-muted-foreground">
						Controls how the Gateway prioritizes providers for the active team
						{teamName ? ` (${teamName})` : ""}.
					</p>
				</div>

				<div className="grid gap-3 md:grid-cols-[240px_1fr] md:items-center">
					<label htmlFor="routing-mode" className="text-sm font-medium">
						Preference
					</label>
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
				</div>

				<div className="grid gap-3 md:grid-cols-[240px_1fr] md:items-center">
					<label htmlFor="beta-channel" className="text-sm font-medium">
						Beta channel
					</label>
					<div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
						<p className="text-sm text-muted-foreground">
							Allow beta providers in production routing (small canary share).
						</p>
						<Switch
							id="beta-channel"
							checked={betaChannelEnabled}
							onCheckedChange={setBetaChannelEnabled}
							aria-label="Enable beta channel"
						/>
					</div>
				</div>

				<div className="rounded-lg border bg-muted/30 p-4">
					<p className="text-sm font-medium">{activeOption?.label}</p>
					<p className="text-sm text-muted-foreground">
						{activeOption?.description}
					</p>
				</div>

				<div className="rounded-xl border bg-background p-4">
					<div className="mb-3">
						<h3 className="text-sm font-semibold">
							Illustrative routing preview
						</h3>
						<p className="text-xs text-muted-foreground">
							Guide only. Live routing also uses compatibility, availability,
							health and failover signals from the last ~30 minutes.
						</p>
					</div>
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

			</CardContent>
		</Card>
	);
}
