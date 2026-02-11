"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogClose,
} from "@/components/ui/dialog";
import {
	HoverCard,
	HoverCardTrigger,
	HoverCardContent,
} from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import PaymentMethodStrip from "@/components/(gateway)/credits/CreditPurchases/TopUp/PaymentMethodStrip";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";
import { Spinner } from "@/components/ui/spinner";
import { ChargeSavedPayment } from "@/app/(dashboard)/settings/credits/actions";

/* Helpers */
const formatUSD = (v: number) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(v);

function clamp(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, n));
}

export default function CreditsPurchaseDialog({
	open,
	onClose,
	wallet,
	stripeInfo,
	tierInfo,
}: {
	open: boolean;
	onClose: () => void;
	wallet?: any;
	stripeInfo?: any;
	tierInfo?: any;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	// CONFIG
	// Allow freeform typing. Require a minimum of $10 and a maximum of $1,000,000
	// before enabling the pay button.
	const MIN = 10;
	const MAX = 1000000;
	const STEP = 0.01;
	const FEE_RATE = tierInfo?.current?.feePct
		? tierInfo.current.feePct / 100
		: 0.1;

	// Default to saving the card for faster future top-ups. Encourage
	// Save & Pay by making it the default and hiding the one-off option
	// behind a small toggle.
	const [mode, setMode] = useState<"oneoff" | "pay_and_save">("pay_and_save");

	const [isLoading, setIsLoading] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	// Use a string for the raw input so the user can freely delete/enter
	// characters (empty string, partial decimals, etc.). Parse it into a
	// number when needed for validation and calculations.
	const [rawAmount, setRawAmount] = useState<string>("25");
	const parsed = useMemo(() => {
		const n = parseFloat(rawAmount as any);
		return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
	}, [rawAmount]);

	const amount = parsed; // for backwards-compat uses below
	// When the input is empty or invalid, show $0 as the credits amount
	const displayAmount = Number.isNaN(parsed) ? 0 : parsed;

	// Fee = max($1, 10% of amount)
	const fee = useMemo(() => {
		if (Number.isNaN(parsed)) return 0;
		const calc = Math.max(parsed * FEE_RATE, 1);
		return Math.round(calc * 100) / 100;
	}, [parsed]);

	const total = useMemo(() => {
		return !Number.isNaN(parsed)
			? Math.round((parsed + fee) * 100) / 100
			: 0;
	}, [parsed, fee]);

	// Total cap (including fee)
	const TOTAL_CAP = 999_999;

	const totalWithinCap = useMemo(() => {
		if (Number.isNaN(parsed)) return false;
		return parsed >= MIN && parsed <= MAX && parsed + fee <= TOTAL_CAP;
	}, [parsed, fee]);

	const disabled = isLoading || !totalWithinCap;

	// Display logic: show $0 when the input is empty; show em dash when the
	// user has typed a numeric value that is out of allowed bounds; otherwise
	// show the formatted numbers.
	const inputEmpty = rawAmount === "";
	const numericOutOfBounds = !Number.isNaN(parsed) && !totalWithinCap;

	const creditsDisplay = inputEmpty
		? formatUSD(0)
		: numericOutOfBounds
		? "--"
		: formatUSD(parsed);
	const feeDisplay = inputEmpty
		? formatUSD(0)
		: numericOutOfBounds
		? "--"
		: formatUSD(fee);
	const totalDisplay = inputEmpty
		? formatUSD(0)
		: numericOutOfBounds
		? "--"
		: formatUSD(total);

	const quickPicks = [10, 25, 50, 100];

	// Default selection: only auto-select the Stripe default payment method.
	const [selectedPm, setSelectedPm] = useState<string | "new" | null>(() => {
		const defaultId = stripeInfo?.defaultPaymentMethodId ?? null;
		const firstMethodId = stripeInfo?.paymentMethods?.[0]?.id ?? null;
		// Prefer default -> first saved method -> new card.
		if (defaultId) return defaultId;
		if (firstMethodId) return firstMethodId;
		return "new";
	});

	// Keep selection sane when payment methods refresh.
	useEffect(() => {
		const defaultId = stripeInfo?.defaultPaymentMethodId ?? null;
		const firstMethodId = stripeInfo?.paymentMethods?.[0]?.id ?? null;
		const hasMethods = (stripeInfo?.paymentMethods?.length ?? 0) > 0;
		if (selectedPm === null) {
			if (defaultId) {
				setSelectedPm(defaultId);
			} else if (firstMethodId) {
				setSelectedPm(firstMethodId);
			} else if (!hasMethods) {
				setSelectedPm("new");
			}
		}
		if (selectedPm && selectedPm !== "new" && hasMethods) {
			const exists = (stripeInfo?.paymentMethods ?? []).some((m: any) => m.id === selectedPm);
			if (!exists) {
				setSelectedPm(defaultId ?? firstMethodId ?? "new");
			}
		}
	}, [selectedPm, stripeInfo]);

	async function handlePay() {
		if (disabled) return;
		setErr(null);
		setIsLoading(true);
		// Update URL to indicate a payment attempt is in progress so the
		// parent page can show a processing banner. Use a short unique-ish
		// value (timestamp) to avoid caching and allow multiple attempts.
		try {
			const params = new URLSearchParams(searchParams?.toString() ?? "");
			params.set("payment_attempt", String(Date.now()));
			const url = `${window.location.pathname}?${params.toString()}`;
			// push a new history entry without reloading the page
			router.push(url);
		} catch (e) {
			// non-fatal; continue
		}
		try {
			const clientUserId =
				(window as any).__USER_ID__ || document?.body?.dataset?.userId;
			const customerId =
				stripeInfo?.customer?.id ?? wallet?.stripe_customer_id ?? null;
			const teamId = wallet?.team_id ?? null;

			if (selectedPm && selectedPm !== "new") {
				const response = await ChargeSavedPayment({
					customerId,
					payment_method_id: selectedPm,
					amount_pence: Math.round(total * 100),
					currency: "usd",
					kind: mode,
					user_id: clientUserId ?? null,
					event_type: "top_up",
					team_id: teamId,
				} as any);

				const { data, status, ok } = response;

				// --- 402: additional action needed (e.g. 3DS) ---
				if (status === 402) {
					const piClientSecret =
						data?.clientSecret ||
						data?.payment_intent?.clientSecret;
					if (piClientSecret) {
						const stripe = await loadStripe(
							process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
						);
						if (!stripe)
							throw new Error("Stripe.js failed to load.");
						const { error } = await stripe.handleNextAction({
							clientSecret: piClientSecret,
						});
						if (error) {
							toast.error("Authentication failed", {
								description:
									error.message ??
									"Try another card or method.",
							});
							setIsLoading(false);
							return; // don't fall through
						}
						toast.success("Authenticated", {
							description: "Finishing your payment...",
						});
						onClose();
						return; // don't fall through
					}
					// If we got 402 but no client secret, treat as a decline
					toast.error("Payment declined", {
						description:
							data?.error ??
							"Action required but no client secret returned.",
					});
					setIsLoading(false);
					return;
				}

				// --- 2xx: succeeded or processing ---
				if (ok) {
					const status = (data?.status || "").toLowerCase();
					if (status === "succeeded") {
						toast.success("Payment successful");
						onClose();
						return; // don't fall through
					}
					if (
						status === "processing" ||
						status === "requires_capture"
					) {
						toast.message("Payment processing", {
							description: "We'll update your balance shortly.",
						});
						onClose();
						return; // don't fall through
					}
					// Unexpected ok status - treat as success-ish and let the webhook settle it
					onClose();
					return; // don't fall through
				}

				// --- Non-402 error (e.g., 4xx/5xx) ---
				toast.error("Payment failed", {
					description: data?.error ?? `Server ${status}`,
				});
				setIsLoading(false);
				return; // don't fall through
			}
			// If we got here, user chose "new" or no saved PM available -> go to Checkout:
			const response = await fetch("/api/checkout/create", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					kind: mode,
					amount_pence: Math.round(total * 100),
					currency: "usd",
					charge_immediately: true,
					save_payment_method: mode === "pay_and_save",
					customerId,
					user_id: clientUserId ?? null,
					team_id: teamId,
				}),
			});

			const data = await response.json();
			if (!response.ok) {
				throw new Error(
					data?.error || data?.message || `Server ${response.status}`
				);
			}
			if (data.url) window.location.href = data.url;
		} catch (e: any) {
			setErr(e?.message || "Something went wrong. Please try again.");
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-lg p-0 overflow-hidden">
				{/* Remove number input spinners for the amount input */}
				<style>{`#amount::-webkit-outer-spin-button, #amount::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; } #amount { -moz-appearance: textfield; }`}</style>
				{/* Header */}
				<div className="px-6 pt-6">
					<DialogHeader className="space-y-1">
						<DialogTitle className="text-xl">
							Top up credits
						</DialogTitle>
						<DialogDescription>
							Pick a card, choose an amount, and confirm. A small
							service fee applies.
						</DialogDescription>
					</DialogHeader>
				</div>

				{/* Body - single column */}
				<div className="px-6 space-y-4">
					{/* 1. Payment method */}
					<PaymentMethodStrip
						stripeInfo={stripeInfo}
						value={selectedPm}
						onChange={setSelectedPm}
					/>

					{/* 2. Pay mode -- simplified: default is Save & Pay; show a small tucked-away One-off switch */}
					{((stripeInfo?.paymentMethods?.length ?? 0) === 0 &&
						!stripeInfo?.hasPaymentMethod) ||
					selectedPm === "new" ? (
						<>
							<Separator />
							<section className="space-y-3">
								<div className="flex items-center justify-between">
									<div className="text-sm font-medium">
										Payment type
									</div>
									<div className="flex items-center gap-3">
										<div className="text-xs text-zinc-600">
											Use one-off
										</div>
										<Switch
											checked={mode === "oneoff"}
											onCheckedChange={(v: boolean) =>
												setMode(
													v
														? "oneoff"
														: "pay_and_save"
												)
											}
											aria-label="Use one-off payment"
										/>
									</div>
								</div>
								<p className="text-xs text-zinc-600">
									{mode === "pay_and_save"
										? "Your card will be saved for faster top-ups next time."
										: "We'll process a one-off payment for this top-up only."}
								</p>
							</section>
						</>
					) : null}

					<Separator />

					{/* 3. Amount */}
					<section className="space-y-4" aria-label="Choose amount">
						<div className="grid grid-cols-4 gap-2">
							{quickPicks.map((v) => (
								<Button
									key={v}
									type="button"
									variant={
										!Number.isNaN(amount) &&
										Math.abs(amount - v) < 0.001
											? "default"
											: "outline"
									}
									size="sm"
									className="rounded-full w-full"
									onClick={() => setRawAmount(String(v))}
								>
									{formatUSD(v)}
								</Button>
							))}
						</div>

						<div className="flex items-center">
							{/* Seamless amount control: joined buttons + input (full width) with rounded focus ring */}
							<div className="inline-flex items-center rounded-full border border-zinc-200 overflow-hidden w-full focus-within:ring-2 focus-within:ring-indigo-400 focus-within:ring-offset-1">
								{/* Dollar badge in place of left button */}
								<div className="h-10 w-10 flex items-center justify-center text-zinc-600 text-sm font-medium border-r border-zinc-200">
									$
								</div>

								<div className="relative flex-1">
									<label htmlFor="amount" className="sr-only">
										Amount in dollars
									</label>
									{/* remove extra left padding because badge occupies the left */}
									<Input
										id="amount"
										inputMode="decimal"
										type="number"
										min={MIN}
										max={MAX}
										step={STEP}
										className="pl-4 pr-6 text-right text-lg rounded-none border-0 w-full focus:outline-none focus-visible:ring-0 dark:focus-visible:ring-0"
										// Keep the input freeform as a string so the user
										// can delete everything. Parse later for validation.
										value={rawAmount}
										onChange={(e) => {
											setRawAmount(e.target.value);
										}}
										onBlur={() => {
											// Only normalize formatting on blur when the
											// current input parses as a valid number.
											if (!Number.isNaN(parsed)) {
												// Keep two decimal places when possible
												setRawAmount(
													String(
														parsed.toFixed(2)
													).replace(/\.00$/, "")
												);
											}
										}}
									/>
								</div>
							</div>
						</div>

						{/* Validation message + Cost breakdown pill */}
						{/* Validation messages */}
						{!Number.isNaN(parsed) && parsed < MIN ? (
							<div className="text-sm text-red-600">
								Must buy a minimum of $10 of credits
							</div>
						) : !Number.isNaN(parsed) && parsed > MAX ? (
							<div className="text-sm text-red-600">
								Maximum single top-up is $1,000,000 (before
								fees)
							</div>
						) : !Number.isNaN(parsed) &&
						  parsed + fee > TOTAL_CAP ? (
							<div className="text-sm text-red-600">
								Total including fee must not exceed $999,999
							</div>
						) : null}

						{/* Cost breakdown pill */}
						<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
							<div className="flex items-center gap-2">
								<span>Credits</span>
								<span className="font-medium">
									{creditsDisplay}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-zinc-600">
									Service Fee
								</span>
								<HoverCard>
									<HoverCardTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											aria-label="Service fee info"
											className="inline-flex"
										>
											<Info className="h-4 w-4 text-zinc-400" />
										</Button>
									</HoverCardTrigger>
									<HoverCardContent>
										We charge{" "}
										{(FEE_RATE * 100)
											.toFixed(2)
											.replace(/\.?0+$/, "")}
										% of the top-up as a service fee, with a
										minimum fee of $1.
									</HoverCardContent>
								</HoverCard>
								<span className="font-medium">
									{feeDisplay}
								</span>
							</div>
						</div>
					</section>

					{err && (
						<div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
							{err}
						</div>
					)}
				</div>

				{/* Sticky footer (review & pay) */}
				<div className="sticky bottom-0 w-full border-t bg-white/70 backdrop-blur supports-backdrop-filter:bg-white/60">
					<div className="px-6 py-3 flex items-center justify-between gap-3">
						<div className="text-sm">
							<div className="text-zinc-600">Total</div>
							<div className="text-base font-semibold">
								{totalDisplay}
							</div>
						</div>

						<div className="flex items-center gap-2">
							<DialogClose asChild>
								<Button variant="secondary">Cancel</Button>
							</DialogClose>

							<Button
								className="min-w-48"
								disabled={disabled}
								onClick={handlePay}
							>
								{isLoading ? (
									<span className="inline-flex items-center gap-2">
										<Spinner className="h-4 w-4" />
										Processing...
									</span>
								) : selectedPm && selectedPm !== "new" ? (
									(() => {
										const sel = (
											stripeInfo?.paymentMethods ?? []
										).find((p: any) => p.id === selectedPm);
										const brand =
											sel?.card?.brand ?? "Card";
										const last4 =
											sel?.card?.last4 ?? "****";
										return `Pay with ${brand} ****${last4}`;
									})()
								) : mode === "oneoff" ? (
									"Continue to checkout"
								) : (
									"Save card & pay"
								)}
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
