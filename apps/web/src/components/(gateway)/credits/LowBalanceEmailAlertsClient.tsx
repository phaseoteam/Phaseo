"use client";

import * as React from "react";
import { toast } from "sonner";

import { setLowBalanceEmailAlert } from "@/app/(dashboard)/settings/credits/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function LowBalanceEmailAlertsClient(props: {
	enabled: boolean;
	thresholdUsd: number | null;
}) {
	const [enabled, setEnabled] = React.useState(Boolean(props.enabled));
	const [threshold, setThreshold] = React.useState<string>(
		props.thresholdUsd == null ? "" : String(props.thresholdUsd),
	);

	const debounceRef = React.useRef<number | null>(null);
	React.useEffect(() => {
		return () => {
			if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
		};
	}, []);

	const scheduleSave = React.useCallback(
		(next: { enabled: boolean; thresholdUsd: number | null }) => {
			if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
			debounceRef.current = window.setTimeout(() => {
				toast.promise(setLowBalanceEmailAlert(next), {
					loading: "Saving low balance alert...",
					success: "Saved",
					error: (e: any) => e?.message ?? "Failed to save alert",
				});
			}, 500);
		},
		[],
	);

	const parsedThresholdUsd = React.useMemo(() => {
		const trimmed = threshold.trim();
		if (!trimmed) return null;
		const v = Number(trimmed);
		return Number.isFinite(v) ? v : null;
	}, [threshold]);

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Low balance email alert</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center justify-between gap-4">
					<div className="min-w-0">
						<div className="text-sm font-medium">Email me when balance is low</div>
						<div className="text-xs text-muted-foreground">
							Send an email alert when your credit balance drops below a threshold.
						</div>
					</div>
					<div className="shrink-0">
						<Switch
							checked={enabled}
							onCheckedChange={(next) => {
								setEnabled(Boolean(next));
								scheduleSave({
									enabled: Boolean(next),
									thresholdUsd: Boolean(next) ? parsedThresholdUsd : null,
								});
							}}
						/>
					</div>
				</div>

				<div className="grid gap-2 sm:max-w-sm">
					<Label htmlFor="low-balance-threshold">Threshold (USD)</Label>
					<Input
						id="low-balance-threshold"
						inputMode="decimal"
						placeholder="e.g. 25"
						value={threshold}
						disabled={!enabled}
						onChange={(e) => {
							setThreshold(e.target.value);
							scheduleSave({
								enabled,
								thresholdUsd: enabled ? (Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : null) : null,
							});
						}}
					/>
					<div className="text-xs text-muted-foreground">
						Use a whole number (e.g. 25). Set to empty to clear.
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

