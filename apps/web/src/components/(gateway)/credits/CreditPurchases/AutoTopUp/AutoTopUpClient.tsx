"use client";

import React, { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	SetUpAutoTopUp,
	DisableAutoTopUpServer,
} from "@/app/(dashboard)/settings/credits/actions";
import { toast } from "sonner";
import { CreditCard, Info, Loader2, ShieldCheck } from "lucide-react";

interface PaymentMethodCard {
	brand?: string | null;
	last4?: string | null;
	exp_month?: number | null;
	exp_year?: number | null;
}

interface PaymentMethod {
	id: string;
	card?: PaymentMethodCard;
}

interface StripeInfo {
	paymentMethods?: PaymentMethod[];
	defaultPaymentMethodId?: string | null;
}

interface Wallet {
	stripe_customer_id?: string | null;
	balance_bigint?: number | null;
	auto_top_up_enabled: boolean | null;
	low_balance_threshold: number | null; // nanos
	auto_top_up_amount: number | null; // nanos
}

interface Props {
	wallet?: Wallet | null;
	stripeInfo?: StripeInfo | null;
	mfaEnabled: boolean;
	embedded?: boolean;
}

const MFA_BYPASS_CONFIRMATION = "I ACCEPT THE RISK";

const fmtUSD = (v: number) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(v);

const toNumber = (v: string): number | "" =>
	v === "" ? "" : Number.parseFloat(v.replace(/[^0-9.]/g, ""));

// --- helper to choose a sensible default PM ---
function getDefaultPmId(info?: StripeInfo | null): string | null {
	if (!info) return null;
	if (info.defaultPaymentMethodId) return info.defaultPaymentMethodId;
	const first = info.paymentMethods?.[0]?.id ?? null;
	return first ?? null;
}

export default function AutoTopUpClient({
	wallet,
	stripeInfo,
	mfaEnabled,
	embedded = false,
}: Props) {
	// Compute current "best" default PM based on provided stripeInfo
	const initialDefaultPm = useMemo(
		() => getDefaultPmId(stripeInfo),
		[stripeInfo]
	);

	const [open, setOpen] = useState(false);
	const [enabled, setEnabled] = useState<boolean>(
		() => wallet?.auto_top_up_enabled === true
	);

	// Always start with the default (or first) payment method if available
	const [selectedPm, setSelectedPm] = useState<string | "new" | null>(
		() => initialDefaultPm
	);

	const [minBefore, setMinBefore] = useState<number | "">(() => {
		if (wallet?.auto_top_up_enabled !== true) return "";
                const v = wallet?.low_balance_threshold ?? null; // nanos
                return v == null ? "" : Math.round(v) / 1e9;
	});

	const [topUpAmount, setTopUpAmount] = useState<number | "">(() => {
		if (wallet?.auto_top_up_enabled !== true) return "";
                const v = wallet?.auto_top_up_amount ?? null; // nanos
                return v == null ? "" : Math.round(v) / 1e9;
	});

	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hasChanges, setHasChanges] = useState(false);
	const [mfaBypassAcknowledged, setMfaBypassAcknowledged] = useState(false);
	const [mfaBypassPhrase, setMfaBypassPhrase] = useState("");

	const methods: PaymentMethod[] = stripeInfo?.paymentMethods ?? [];
	const methodIds = useMemo(
		() => new Set(methods.map((m) => m.id)),
		[methods]
	);

	// Keep selectedPm sane when dialog opens or stripeInfo changes
	useEffect(() => {
		if (!open) return; // only adjust on open to avoid surprising changes while closed
		const nextDefault = getDefaultPmId(stripeInfo);
		const selectedStillValid =
			selectedPm && selectedPm !== "new" && methodIds.has(selectedPm);
		if (!selectedStillValid) {
			setSelectedPm(nextDefault);
		}
		setHasChanges(false);
	}, [open, stripeInfo, methodIds, selectedPm]);

	async function handleDisable() {
		setError(null);
		setSaving(true);
		try {
			await toast.promise(DisableAutoTopUpServer(), {
				loading: "Disabling auto top-up...",
				success: "Auto top-up disabled",
				error: (err) => err?.message ?? "Failed to disable auto top-up",
			});
			setEnabled(false);
			setOpen(false);
			setHasChanges(false);
		} catch (e: any) {
			setError(
				e?.message ?? "Something went wrong disabling auto top-up."
			);
		} finally {
			setSaving(false);
		}
	}

	const canSubmit = useMemo(() => {
		const securityRequirementMet =
			enabled ||
			mfaEnabled ||
			(mfaBypassAcknowledged && mfaBypassPhrase === MFA_BYPASS_CONFIRMATION);
		if (!securityRequirementMet) return false;
		if (!selectedPm || selectedPm === "new") return false;
		if (!methodIds.has(selectedPm)) return false;
		if (minBefore === "" || topUpAmount === "") return false;
		if (typeof minBefore !== "number" || typeof topUpAmount !== "number")
			return false;
		if (minBefore <= 0 || topUpAmount <= 0) return false;
		if (topUpAmount < 1) return false; // guardrail: minimum $1
		return true;
	}, [
		enabled,
		mfaEnabled,
		mfaBypassAcknowledged,
		mfaBypassPhrase,
		selectedPm,
		minBefore,
		topUpAmount,
		methodIds,
	]);

	async function handleSave() {
		setError(null);
		setSaving(true);
		try {
			const payload = {
				enabled,
				min_balance_nanos:
					typeof minBefore === "number"
                                                ? Math.round(minBefore * 1e9)
                                                : null,
				top_up_amount_nanos:
					typeof topUpAmount === "number"
                                                ? Math.round(topUpAmount * 1e9)
                                                : null,
				auto_top_up_account_id:
					selectedPm && selectedPm !== "new" ? selectedPm : null,
			};

			await toast.promise(
				SetUpAutoTopUp({
					balanceThreshold: payload.min_balance_nanos ?? 0,
					topUpAmount: payload.top_up_amount_nanos ?? 0,
					paymentMethodId: payload.auto_top_up_account_id ?? null,
					mfaBypassAcknowledged: !mfaEnabled && mfaBypassAcknowledged,
					mfaBypassPhrase: !mfaEnabled ? mfaBypassPhrase : undefined,
				}),
				{
					loading: "Saving auto top-up settings...",
					success: "Auto top-up enabled",
					error: (err) => err?.message ?? "Failed to save settings",
				}
			);

			setEnabled(true);
			setOpen(false);
			setHasChanges(false);
		} catch (e: any) {
			setError(
				e?.message ?? "Something went wrong saving your settings."
			);
		} finally {
			setSaving(false);
		}
	}

	function PMTile({
		pm,
		active,
		onClick,
		isDefault,
	}: {
		pm: PaymentMethod;
		active: boolean;
		onClick: () => void;
		isDefault?: boolean;
	}) {
		return (
			<button
				type="button"
				onClick={onClick}
				className={cn(
					"w-full rounded-2xl border p-3 text-left transition-all",
					active
						? "border-primary bg-primary/5 shadow-sm"
						: "border-border bg-background hover:-translate-y-px hover:bg-muted"
				)}
				aria-pressed={active}
			>
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-3">
						<div className="flex items-center justify-center rounded-lg bg-muted p-2">
							<CreditCard className="h-5 w-5 text-muted-foreground" />
						</div>

						<div className="leading-tight">
							<div className="text-sm font-medium capitalize text-foreground">
								<span data-pii="true">****{pm.card?.last4 ?? ""}</span>
							</div>
							<div className="text-xs capitalize text-muted-foreground">
								{pm.card?.brand ?? "Card"}
							</div>
						</div>
					</div>

					{/* right-side check/default area */}
					<div className="flex items-center gap-2">
						{isDefault && (
							<span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
								Default
							</span>
						)}

						{active ? (
							<span className="inline-flex items-center rounded-full bg-primary p-1">
								<Check className="h-3 w-3 text-white" />
							</span>
						) : (
							<span className="inline-flex items-center rounded-full bg-muted p-1">
								<Check className="h-3 w-3 text-transparent" />
							</span>
						)}
					</div>
				</div>
			</button>
		);
	}

	const Container = embedded ? "div" : Card;

	return (
		<Container className={embedded ? "space-y-3" : undefined}>
			<CardHeader
				className={cn(
					"flex flex-row items-center justify-between pb-0",
					embedded && "p-0"
				)}
			>
				<CardTitle
					className={cn(
						"flex items-center gap-2",
						embedded && "text-base font-semibold"
					)}
				>
					Auto Top-Up
					<Tooltip>
						<TooltipTrigger asChild>
							<Info className="h-4 w-4 text-muted-foreground" />
						</TooltipTrigger>
						<TooltipContent>
							<p>
								Automatically add credits when your balance
								drops below a threshold.
							</p>
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<Badge
					className={cn(
						"rounded-full text-xs transition-colors",
						enabled
							? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
							: "bg-destructive/10 text-destructive hover:bg-destructive/20"
					)}
				>
					{enabled ? "Enabled" : "Disabled"}
				</Badge>
			</CardHeader>

			{embedded ? null : <Separator className="my-4" />}

			<CardContent className={cn("space-y-3", embedded && "p-0")}>
				<Dialog
					open={open}
					onOpenChange={(nextOpen) => {
						setOpen(nextOpen);
						if (!nextOpen) {
							setMfaBypassAcknowledged(false);
							setMfaBypassPhrase("");
						}
					}}
				>
					<DialogTrigger asChild>
						<Button variant="outline" className="w-full">
							{enabled ? "Configure" : "Enable"}
						</Button>
					</DialogTrigger>

					<DialogContent className="flex max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
						<div className="shrink-0 px-6 pt-6">
							<DialogHeader className="space-y-1">
								<DialogTitle className="text-xl">
									Configure Auto Top-Up
								</DialogTitle>
							</DialogHeader>
						</div>

						<ScrollArea
							className="min-h-0 flex-1"
							viewportClassName="overscroll-y-contain px-6 py-4"
						>
							<div className="space-y-4">
								{!mfaEnabled ? (
									<Alert className={cn(enabled && "border-amber-500/25 bg-amber-500/5")}>
										<ShieldCheck
											className={cn(
												"h-4 w-4",
												enabled && "text-amber-700 dark:text-amber-300"
											)}
										/>
										<AlertTitle
											className={cn(
												enabled && "text-amber-950 dark:text-amber-100"
											)}
										>
											{enabled
												? "Auto Top-Up is active without 2FA"
												: "Two-factor authentication is recommended"}
										</AlertTitle>
										<AlertDescription>
											{enabled
												? "2FA is not enabled on this account. We recommend "
												: "Protect automatic charges with two-factor authentication. You can continue without it only after acknowledging the risk. "}
											<Link href="/settings/account/mfa">Set up MFA</Link>
											{enabled ? " to protect automatic charges." : null}
										</AlertDescription>
									</Alert>
								) : null}

								{!mfaEnabled && !enabled ? (
									<div className="space-y-3 rounded-2xl border border-border bg-card p-4">
										<div className="space-y-1">
											<div className="font-medium">Continue without 2FA</div>
											<p className="text-sm text-muted-foreground">
												Without 2FA, anyone who gets access to your account may be able
												to trigger automatic charges. Continue only if you accept that
												security risk.
											</p>
										</div>

										<div className="flex items-start gap-3">
											<Checkbox
												id="mfa-bypass-acknowledgement"
												checked={mfaBypassAcknowledged}
												onCheckedChange={(checked) => {
													setMfaBypassAcknowledged(checked === true);
													if (checked !== true) setMfaBypassPhrase("");
												}}
											/>
														<Label
															htmlFor="mfa-bypass-acknowledgement"
															className="cursor-pointer text-sm font-normal leading-relaxed"
														>
															<span className="min-w-0 flex-1">
																I understand that keeping my account secure is my responsibility,
																that bypassing 2FA increases the risk of unauthorized charges, and
																I accept that risk under the{" "}
													<Link
														href="/terms"
														className="whitespace-nowrap underline underline-offset-2"
													>
														Terms of Service
													</Link>{" "}
													and applicable law.
												</span>
											</Label>
										</div>

										{mfaBypassAcknowledged ? (
											<div className="space-y-2 border-t border-border pt-3">
												<Label htmlFor="mfa-bypass-phrase">
													Type <span className="font-mono">{MFA_BYPASS_CONFIRMATION}</span> to confirm.
												</Label>
												<Input
													id="mfa-bypass-phrase"
													value={mfaBypassPhrase}
													onChange={(event) => setMfaBypassPhrase(event.target.value)}
													autoComplete="off"
													placeholder={MFA_BYPASS_CONFIRMATION}
												/>
												<p className="text-xs text-muted-foreground">
													Review the{" "}
													<Link
														href="/terms"
														className="whitespace-nowrap underline underline-offset-2"
													>
														Terms of Service
													</Link>{" "}
													before continuing.
												</p>
											</div>
										) : null}
									</div>
								) : null}

								{/* Payment methods */}
								<section>
									<Label className="text-sm">
									Payment method to charge
								</Label>
								<div className="mt-2">
									{methods?.length ? (
										<div
											role="radiogroup"
											aria-label="Select payment method"
											className="grid grid-cols-1 items-start gap-3"
										>
											{methods
												.slice(0, 2)
												.map((pm: PaymentMethod) => {
													const active =
														selectedPm === pm.id;
													const isDefault =
														stripeInfo?.defaultPaymentMethodId ===
														pm.id;
													return (
														<div key={pm.id}>
															<PMTile
																pm={pm}
																active={
																	!!active
																}
																onClick={() => {
																	setSelectedPm(
																		pm.id
																	);
																	setHasChanges(
																		true
																	);
																}}
																isDefault={
																	isDefault
																}
															/>
														</div>
													);
												})}

											{methods.length > 2 ? (
												<div className="flex items-center">
													<div className="relative">
														<button
															type="button"
															className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-background p-3 hover:bg-muted"
															aria-haspopup="menu"
														>
															<svg
																xmlns="http://www.w3.org/2000/svg"
																className="h-4 w-4"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
															>
																<path
																	strokeLinecap="round"
																	strokeLinejoin="round"
																	strokeWidth="2"
																	d="M6 9l6 6 6-6"
																/>
															</svg>
														</button>

														<div className="absolute left-0 z-10 mt-2 w-72 rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
															<div className="p-2">
																{methods
																	.slice(2)
																	.map(
																		(
																			pm: PaymentMethod
																		) => (
																			<button
																				key={
																					pm.id
																				}
																				type="button"
																				onClick={() => {
																					setSelectedPm(
																						pm.id
																					);
																					setHasChanges(
																						true
																					);
																				}}
																				className="flex w-full items-center justify-between rounded-md p-2 text-left hover:bg-muted"
																			>
																				<div className="leading-tight">
																					<div className="text-sm font-medium">
																				<span className="text-foreground" data-pii="true">
																							****{pm.card?.last4}
																						</span>
																				<div className="text-xs capitalize text-muted-foreground">
																							{pm
																								.card
																								?.brand ??
																								"Card"}
																						</div>
																					</div>
																				</div>
																				{stripeInfo?.defaultPaymentMethodId ===
																					pm.id && (
																					<Badge
																						variant="secondary"
																						className="text-[10px]"
																					>
																						Default
																					</Badge>
																				)}
																			</button>
																		)
																	)}
															</div>
														</div>
													</div>
													<div className="ml-2 text-xs text-muted-foreground">
														+{methods.length - 2}
													</div>
												</div>
											) : null}
										</div>
									) : (
										<div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
											No saved payment methods found. You
											must add a card in Billing before
											enabling Auto Top-Up.
										</div>
									)}
								</div>
							</section>

							{/* Thresholds */}
							<section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<Label
										htmlFor="min-before"
										className="mb-2"
									>
										When balance is below (USD)
									</Label>
									<Input
										id="min-before"
										inputMode="decimal"
										placeholder="e.g. 5.00"
										value={
											minBefore === ""
												? ""
												: String(minBefore)
										}
										onChange={(e) => {
											setMinBefore(
												toNumber(e.target.value)
											);
											setHasChanges(true);
										}}
									/>
									<p className="mt-1 text-xs text-muted-foreground">
										We recommend less than your usual
										top-up.
									</p>
								</div>
								<div>
									<Label
										htmlFor="topup-amount"
										className="mb-2"
									>
										Top-up amount (USD)
									</Label>
									<Input
										id="topup-amount"
										inputMode="decimal"
										placeholder="e.g. 20.00"
										value={
											topUpAmount === ""
												? ""
												: String(topUpAmount)
										}
										onChange={(e) => {
											setTopUpAmount(
												toNumber(e.target.value)
											);
											setHasChanges(true);
										}}
									/>
									<p className="mt-1 text-xs text-muted-foreground">
										Minimum $1.00 per top-up.
									</p>
								</div>
							</section>

							{error && (
								<div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
									{error}
								</div>
							)}
							</div>
						</ScrollArea>

						{/* Sticky footer */}
						<div className="shrink-0 w-full border-t border-border bg-popover/95 backdrop-blur supports-[backdrop-filter]:bg-popover/85">
							<div className="px-6 py-3 flex items-center justify-between gap-3">
								<DialogClose asChild>
									<Button
										variant="secondary"
										disabled={saving}
									>
										Cancel
									</Button>
								</DialogClose>
								{enabled && hasChanges ? (
									<Button
										onClick={handleSave}
										className="min-w-[10rem]"
										disabled={!canSubmit || saving}
									>
										{saving ? (
											<>
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												Saving…
											</>
										) : (
											"Save changes"
										)}
									</Button>
								) : enabled ? (
									<Button
										variant="destructive"
										onClick={handleDisable}
										className="min-w-[10rem]"
										disabled={saving}
									>
										{saving ? (
											<>
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												Disabling…
											</>
										) : (
											"Disable"
										)}
									</Button>
								) : (
									<Button
										onClick={handleSave}
										className="min-w-[10rem]"
										disabled={!canSubmit || saving}
									>
										{saving ? (
											<>
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												Saving…
											</>
										) : (
											"Save & enable"
										)}
									</Button>
								)}
							</div>
						</div>
					</DialogContent>
				</Dialog>

				{enabled && !mfaEnabled ? (
					<Alert className="rounded-lg border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
						<ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-300" />
						<AlertTitle className="text-xs text-amber-950 dark:text-amber-100">
							Two-factor authentication is not enabled
						</AlertTitle>
						<AlertDescription className="text-xs">
							Auto Top-Up is active without 2FA. We recommend{" "}
							<Link href="/settings/account/mfa">setting up MFA</Link>{" "}
							to protect automatic charges.
						</AlertDescription>
					</Alert>
				) : null}

				{/* Summary row */}
				<div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
					<div className="rounded-lg border border-border bg-muted/20 p-2.5">
						<div className="text-xs text-muted-foreground">Triggers at</div>
						<div className="font-medium">
							{minBefore === "" ? "—" : fmtUSD(Number(minBefore))}
						</div>
					</div>
					<div className="rounded-lg border border-border bg-muted/20 p-2.5">
						<div className="text-xs text-muted-foreground">
							Top-up amount
						</div>
						<div className="font-medium">
							{topUpAmount === ""
								? "—"
								: fmtUSD(Number(topUpAmount))}
						</div>
					</div>
				</div>
			</CardContent>
		</Container>
	);
}
