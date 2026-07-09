"use client";

import React, { useMemo, useState } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { SlidersHorizontal, Info } from "lucide-react";
import {
	KeyLimitPayload,
	updateKeyLimitsAction,
} from "@/app/(dashboard)/settings/keys/actions";

const NANOS_PER_USD = 1_000_000_000;

const formatNumber = (value: number | null | undefined) =>
	typeof value === "number" && Number.isFinite(value) && value > 0
		? String(value)
		: "";

const formatUsd = (value: number | null | undefined) =>
	typeof value === "number" && Number.isFinite(value) && value > 0
		? (value / NANOS_PER_USD).toString()
		: "";

const parseInteger = (value: string): number | null | undefined => {
	if (!value || value.trim().length === 0) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return undefined;
	return Math.floor(parsed);
};

const parseUsd = (value: string): number | null | undefined => {
	if (!value || value.trim().length === 0) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return undefined;
	return Math.round(parsed * NANOS_PER_USD);
};

type FormState = {
	dailyRequests: string;
	weeklyRequests: string;
	monthlyRequests: string;
	dailyCostUsd: string;
	weeklyCostUsd: string;
	monthlyCostUsd: string;
};

const buildInitialState = (k: any): FormState => ({
	dailyRequests: formatNumber(k.daily_limit_requests),
	weeklyRequests: formatNumber(k.weekly_limit_requests),
	monthlyRequests: formatNumber(k.monthly_limit_requests),
	dailyCostUsd: formatUsd(k.daily_limit_cost_nanos),
	weeklyCostUsd: formatUsd(k.weekly_limit_cost_nanos),
	monthlyCostUsd: formatUsd(k.monthly_limit_cost_nanos),
});

export default function KeyLimitsItem({
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
	const open = controlledOpen ?? internalOpen;
	const setOpen = onOpenChange ?? setInternalOpen;
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState<FormState>(() => buildInitialState(k));
	const isDirty = useMemo(() => {
		const initial = buildInitialState(k);
		return JSON.stringify(initial) !== JSON.stringify(form);
	}, [k, form]);

	const handleChange = (field: keyof FormState, value: string) => {
		setForm((prev) => ({
			...prev,
			[field]: value,
		}));
	};

	const resetForm = () => setForm(buildInitialState(k));

	const validate = (): KeyLimitPayload | null => {
		const dailyRequests = parseInteger(form.dailyRequests);
		const weeklyRequests = parseInteger(form.weeklyRequests);
		const monthlyRequests = parseInteger(form.monthlyRequests);
		const dailyCostNanos = parseUsd(form.dailyCostUsd);
		const weeklyCostNanos = parseUsd(form.weeklyCostUsd);
		const monthlyCostNanos = parseUsd(form.monthlyCostUsd);

		const invalidField =
			dailyRequests === undefined
				? "Daily request limit"
				: weeklyRequests === undefined
				? "Weekly request limit"
				: monthlyRequests === undefined
				? "Monthly request limit"
				: dailyCostNanos === undefined
				? "Daily cost limit"
				: weeklyCostNanos === undefined
				? "Weekly cost limit"
				: monthlyCostNanos === undefined
				? "Monthly cost limit"
				: null;

		if (invalidField) {
			toast.error(`${invalidField} must be a positive number.`);
			return null;
		}

		return {
			dailyRequests,
			weeklyRequests,
			monthlyRequests,
			dailyCostNanos,
			weeklyCostNanos,
			monthlyCostNanos,
		};
	};

	const onSubmit = async (e?: React.FormEvent) => {
		e?.preventDefault();
		const payload = validate();
		if (!payload) return;

		setSaving(true);
		const toastId = toast.loading("Saving limits...");
		try {
			await updateKeyLimitsAction(k.id, payload);
			toast.success("Limits updated", { id: toastId });
			setOpen(false);
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "Failed to update limits. Please try again.";
			toast.error(message, { id: toastId });
		} finally {
			setSaving(false);
		}
	};

	return (
		<>
			{trigger ? (
				<DropdownMenuItem render={<div
						className="w-full text-left flex items-center gap-2"
						onClick={() => {
							setTimeout(() => {
								resetForm();
								setOpen(true);
							}, 0);
						}} />}>

						<SlidersHorizontal className="mr-2" />
						<span>Limits</span>
						<Badge variant="outline" className="ml-auto">
							Beta
						</Badge>

				</DropdownMenuItem>
			) : null}
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!next) resetForm();
					setOpen(next);
				}}
			>
				<DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<div>
							<div className="flex items-center gap-2">
								<DialogTitle>Per-key limits</DialogTitle>
								<Badge variant="outline">Beta</Badge>
							</div>
							<DialogDescription>
								Configure request and spend guardrails for this
								key. Leave a field blank for unlimited.
							</DialogDescription>
							<p className="text-xs text-muted-foreground mt-2">
								Each window (daily, weekly, monthly) is
								enforced independently—the first limit hit will
								block the key until that bucket resets.
							</p>
						</div>
					</DialogHeader>
					<form
						onSubmit={onSubmit}
						className="space-y-6 text-sm text-left"
					>
						<Alert className="border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-50">
							<Info className="text-sky-600 dark:text-sky-300" />
							<div>
								<AlertTitle>Beta feature</AlertTitle>
								<AlertDescription>
									This limits experience is still
									experimental. Double-check critical keys and
									monitor usage when enabling new guardrails.
								</AlertDescription>
							</div>
						</Alert>
						<div className="grid gap-4 md:grid-cols-3">
							<div className="space-y-2">
								<Label htmlFor="limit-daily-req">
									Daily requests
								</Label>
								<InputGroup>
									<InputGroupInput
										id="limit-daily-req"
										type="number"
										min="0"
										placeholder="Unlimited"
										value={form.dailyRequests}
										onChange={(e) =>
											handleChange(
												"dailyRequests",
												e.target.value
											)
										}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupText>req</InputGroupText>
									</InputGroupAddon>
								</InputGroup>
							</div>
							<div className="space-y-2">
								<Label htmlFor="limit-weekly-req">
									Weekly requests
								</Label>
								<InputGroup>
									<InputGroupInput
										id="limit-weekly-req"
										type="number"
										min="0"
										placeholder="Unlimited"
										value={form.weeklyRequests}
										onChange={(e) =>
											handleChange(
												"weeklyRequests",
												e.target.value
											)
										}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupText>req</InputGroupText>
									</InputGroupAddon>
								</InputGroup>
							</div>
							<div className="space-y-2 md:col-span-1">
								<Label htmlFor="limit-monthly-req">
									Monthly requests
								</Label>
								<InputGroup>
									<InputGroupInput
										id="limit-monthly-req"
										type="number"
										min="0"
										placeholder="Unlimited"
										value={form.monthlyRequests}
										onChange={(e) =>
											handleChange(
												"monthlyRequests",
												e.target.value
											)
										}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupText>req</InputGroupText>
									</InputGroupAddon>
								</InputGroup>
							</div>
						</div>

						<div className="grid gap-4 md:grid-cols-3">
							<div className="space-y-2">
								<Label htmlFor="limit-daily-cost">
									Daily cost
								</Label>
								<InputGroup>
									<InputGroupAddon>
										<InputGroupText>$</InputGroupText>
									</InputGroupAddon>
									<InputGroupInput
										id="limit-daily-cost"
										type="number"
										min="0"
										step="0.01"
										placeholder="Unlimited"
										value={form.dailyCostUsd}
										onChange={(e) =>
											handleChange(
												"dailyCostUsd",
												e.target.value
											)
										}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupText>USD</InputGroupText>
									</InputGroupAddon>
								</InputGroup>
							</div>
							<div className="space-y-2">
								<Label htmlFor="limit-weekly-cost">
									Weekly cost
								</Label>
								<InputGroup>
									<InputGroupAddon>
										<InputGroupText>$</InputGroupText>
									</InputGroupAddon>
									<InputGroupInput
										id="limit-weekly-cost"
										type="number"
										min="0"
										step="0.01"
										placeholder="Unlimited"
										value={form.weeklyCostUsd}
										onChange={(e) =>
											handleChange(
												"weeklyCostUsd",
												e.target.value
											)
										}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupText>USD</InputGroupText>
									</InputGroupAddon>
								</InputGroup>
							</div>
							<div className="space-y-2">
								<Label htmlFor="limit-monthly-cost">
									Monthly cost
								</Label>
								<InputGroup>
									<InputGroupAddon>
										<InputGroupText>$</InputGroupText>
									</InputGroupAddon>
									<InputGroupInput
										id="limit-monthly-cost"
										type="number"
										min="0"
										step="0.01"
										placeholder="Unlimited"
										value={form.monthlyCostUsd}
										onChange={(e) =>
											handleChange(
												"monthlyCostUsd",
												e.target.value
											)
										}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupText>USD</InputGroupText>
									</InputGroupAddon>
								</InputGroup>
							</div>
						</div>

						<Separator />

						<div className="text-xs text-muted-foreground space-y-2">
							<div className="font-medium text-sm text-foreground">
								How limits are enforced
							</div>
							<p>
								Each bucket tracks usage separately—if you set
								a daily cap of 5K requests, a weekly cap of 20K,
								and a monthly cap of 50K, the key will stop
								once it hits any of those thresholds. When the
								daily bucket resets the key resumes unless the
								weekly or monthly caps are still exceeded.
							</p>
						</div>

						<DialogFooter>
							<DialogClose asChild>
								<Button
									type="button"
									variant="ghost"
									onClick={resetForm}
								>
									Cancel
								</Button>
							</DialogClose>
							<Button
								type="submit"
								disabled={saving || !isDirty}
							>
								{saving ? "Saving..." : "Save limits"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
