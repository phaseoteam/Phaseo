"use client";

import * as React from "react";
import { toast } from "sonner";

import {
	setBillingNotificationPreference,
	setLowBalanceEmailAlert,
} from "@/app/(dashboard)/settings/credits/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

function parseThreshold(value: string): number | null {
	const normalized = value.trim();
	if (!/^(?:\d+|\d*\.\d{1,2})$/.test(normalized)) return null;
	const parsed = Number(normalized);
	if (!Number.isFinite(parsed) || parsed < 0) return null;
	const nanos = Math.round(parsed * 1_000_000_000);
	return Number.isSafeInteger(nanos) ? parsed : null;
}

export default function LowBalanceEmailAlertsClient(props: {
	autoTopUpFailureEmailEnabled: boolean;
	enabled: boolean;
	paymentMethodExpiringEmailEnabled: boolean;
	thresholdUsd: number | null;
}) {
	const [autoTopUpFailureEnabled, setAutoTopUpFailureEnabled] = React.useState(props.autoTopUpFailureEmailEnabled);
	const [enabled, setEnabled] = React.useState(Boolean(props.enabled));
	const [paymentMethodExpiringEnabled, setPaymentMethodExpiringEnabled] = React.useState(props.paymentMethodExpiringEmailEnabled);
	const [threshold, setThreshold] = React.useState<string>(
		props.thresholdUsd == null ? "0" : String(props.thresholdUsd),
	);

	const debounceRef = React.useRef<number | null>(null);
	const preferenceDebounceRef = React.useRef<Record<string, number>>({});
	React.useEffect(() => {
		const preferenceTimers = preferenceDebounceRef.current;
		return () => {
			if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
			Object.values(preferenceTimers).forEach((timer) => window.clearTimeout(timer));
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
	const schedulePreferenceSave = React.useCallback((preference: "autoTopUpFailure" | "paymentMethodExpiring", nextEnabled: boolean) => {
		const existing = preferenceDebounceRef.current[preference];
		if (existing != null) window.clearTimeout(existing);
		preferenceDebounceRef.current[preference] = window.setTimeout(() => {
			toast.promise(setBillingNotificationPreference({ preference, enabled: nextEnabled }), {
				loading: "Saving notification preference...",
				success: "Saved",
				error: (error: any) => error?.message ?? "Failed to save notification preference",
			});
		}, 500);
	}, []);

	const parsedThresholdUsd = React.useMemo(() => parseThreshold(threshold), [threshold]);
	const thresholdInvalid = enabled && parsedThresholdUsd == null;

	return (
		<section aria-labelledby="notifications-title" className="space-y-3">
			<h2 id="notifications-title" className="font-heading text-base font-medium">
				Notifications
			</h2>
			<div className="overflow-hidden rounded-xl border bg-background/40">
				<div className="px-4 py-4">
					<div className="flex items-center justify-between gap-4">
						<div className="min-w-0">
							<h3 className="text-sm font-medium">Low Balance Alerts</h3>
							<p className="mt-0.5 text-sm text-muted-foreground">
								Emails are sent to the workspace owner.
							</p>
						</div>
						<Switch
							checked={enabled}
							aria-label="Enable low balance email alerts"
							onCheckedChange={(nextEnabled) => {
								const next = Boolean(nextEnabled);
								setEnabled(next);
								if (next) {
									setThreshold("0");
									scheduleSave({ enabled: true, thresholdUsd: 0 });
									return;
								}
								scheduleSave({ enabled: false, thresholdUsd: null });
							}}
						/>
					</div>
					<div
						className={cn(
							"grid transition-[grid-template-rows,opacity] duration-200 ease-out",
							enabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
						)}
						aria-hidden={!enabled}
					>
						<div className="min-h-0 overflow-hidden">
							<div className="flex flex-col gap-2.5 pt-3 pl-3 sm:flex-row sm:items-center sm:justify-between sm:pl-4">
								<div className="min-w-0">
									<Label htmlFor="low-balance-threshold" className="text-xs font-medium">
										Credit threshold
									</Label>
									<p className="mt-0.5 text-xs text-muted-foreground">
										Alert below this balance. Limited to one email every six hours.
									</p>
								</div>
								<div className="w-full shrink-0 sm:w-32">
									<div className="relative">
										<span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">$</span>
										<Input
											id="low-balance-threshold"
											type="number"
											inputMode="decimal"
											min={0}
											step={0.01}
											placeholder="0"
											className="h-8 pl-7 text-right text-sm"
											value={threshold}
											disabled={!enabled}
											onChange={(e) => {
												const value = e.target.value;
												setThreshold(value);
												const nextThreshold = parseThreshold(value);
												if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
												if (enabled && nextThreshold != null) {
													scheduleSave({ enabled: true, thresholdUsd: nextThreshold });
												}
											}}
										/>
									</div>
									{thresholdInvalid ? (
										<p className="mt-1.5 text-xs text-destructive">
											Use a non-negative amount with up to two decimal places.
										</p>
									) : null}
								</div>
							</div>
						</div>
					</div>
				</div>
				<div className="flex items-center justify-between gap-4 border-t px-4 py-3.5">
					<div className="min-w-0">
						<h3 className="text-sm font-medium">Auto Top-Up Failed</h3>
						<p className="mt-0.5 text-sm text-muted-foreground">Email the workspace owner when an automatic charge fails.</p>
					</div>
					<Switch
						checked={autoTopUpFailureEnabled}
						aria-label="Email the workspace owner when auto top-up fails"
						onCheckedChange={(nextEnabled) => {
							const next = Boolean(nextEnabled);
							setAutoTopUpFailureEnabled(next);
							schedulePreferenceSave("autoTopUpFailure", next);
						}}
					/>
				</div>
				<div className="flex items-center justify-between gap-4 border-t px-4 py-3.5">
					<div className="min-w-0">
						<h3 className="text-sm font-medium">Payment Method Expiring</h3>
						<p className="mt-0.5 text-sm text-muted-foreground">Email the workspace owner before a saved card expires.</p>
					</div>
					<Switch
						checked={paymentMethodExpiringEnabled}
						aria-label="Email the workspace owner before a payment method expires"
						onCheckedChange={(nextEnabled) => {
							const next = Boolean(nextEnabled);
							setPaymentMethodExpiringEnabled(next);
							schedulePreferenceSave("paymentMethodExpiring", next);
						}}
					/>
				</div>
			</div>
		</section>
	);
}

