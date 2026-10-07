"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import PaymentMethodStrip from "@/components/(gateway)/credits/CreditPurchases/TopUp/PaymentMethodStrip";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";
import { Spinner } from "@/components/ui/spinner";
import { ChargeSavedPayment, ReviewPurchaseLocation } from "@/app/(dashboard)/settings/credits/actions";
import { isAnalyticsCaptureAllowed } from "@/lib/clientErrorReporting";
import { captureProductEvent } from "@/lib/productAnalytics";
import { COUNTRY_OPTIONS } from "@/lib/countryCodes";
import { PurchaseLocationStep, type LocationPreview } from "./PurchaseLocationStep";
import { cn } from "@/lib/utils";
import { formatCardBrand } from "./cardBrand";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { SensitiveValue } from "@/components/display/SensitiveValue";

/* Helpers */
const formatUSD = (v: number, locale: string) =>
	new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "USD",
	}).format(v);

const formatInputAmount = (value: number, locale: string) =>
	new Intl.NumberFormat(locale, {
		useGrouping: false,
		maximumFractionDigits: 2,
	}).format(value);

function parseLocaleAmount(value: string, locale: string): number {
	if (value.trim() === "") return Number.NaN;
	const numberFormat = new Intl.NumberFormat(locale);
	const decimalSeparator = numberFormat
		.formatToParts(1.1)
		.find((part) => part.type === "decimal")?.value ?? ".";
	const minusSign = numberFormat
		.formatToParts(-1)
		.find((part) => part.type === "minusSign")?.value ?? "-";
	const groupSeparators = new Set(
		new Intl.NumberFormat(locale, { useGrouping: true })
			.formatToParts(12345.6)
			.filter((part) => part.type === "group")
			.map((part) => part.value),
	);
	const digitFormat = new Intl.NumberFormat(locale, { useGrouping: false });
	let normalized = value.trim();
	for (const [digit, localizedDigit] of Array.from({ length: 10 }, (_, digit) => [
		String(digit),
		digitFormat.format(digit),
	] as const)) {
		normalized = normalized.replaceAll(localizedDigit, digit);
	}
	for (const separator of groupSeparators) {
		normalized = normalized.replaceAll(separator, "");
	}
	normalized = normalized.replaceAll(minusSign, "-").replace(decimalSeparator, ".").replace(/[^0-9.-]/g, "");
	const decimalIndex = normalized.indexOf(".");
	if (decimalIndex >= 0) {
		normalized = `${normalized.slice(0, decimalIndex + 1)}${normalized.slice(decimalIndex + 1).replaceAll(".", "")}`;
	}
	if (!normalized || normalized === ".") return Number.NaN;
	const parsed = Number.parseFloat(normalized);
	return Number.isFinite(parsed) ? parsed : Number.NaN;
}

const CHECKOUT_STEP_VARIANTS: Variants = {
	initial: (direction: number) => ({
		opacity: direction === 0 ? 1 : 0,
		x: direction * 42,
	}),
	animate: { opacity: 1, x: 0 },
	exit: (direction: number) => ({
		opacity: direction === 0 ? 1 : 0,
		x: direction * -28,
	}),
};

const QUICK_PICKS = [5, 10, 25, 50, 100, 250, 500, 1_000];

function trackFirstPaymentSaveCardClick(payload: {
	creditsAmountUsd: number;
	feeUsd: number;
	totalUsd: number;
}) {
	if (typeof window === "undefined" || !isAnalyticsCaptureAllowed()) {
		return;
	}

	captureProductEvent("first_payment_save_card_click", {
		amount_usd: payload.creditsAmountUsd,
		currency: "usd",
		fee_usd: payload.feeUsd,
		surface: "credits_top_up_dialog",
		total_usd: payload.totalUsd,
	});
}

export default function CreditsPurchaseDialog({
	declaredCountryCode,
	open,
	onClose,
	wallet,
	stripeInfo,
	tierInfo,
}: {
	declaredCountryCode?: string | null;
	open: boolean;
	onClose: () => void;
	wallet?: any;
	stripeInfo?: any;
	tierInfo?: any;
}) {
	const locale = useLocale();
	const t = useTranslations("SettingsUI");
	const text = (key: string, values?: Record<string, string>) => {
		let message = t(`credits.purchaseFlow.${key}` as never);
		for (const [name, value] of Object.entries(values ?? {})) {
			message = message.replace(`{${name}}`, value);
		}
		return message;
	};
	const format = useDisplayFormatters();
	const formatUSD = (value: number, _locale?: string) => format.number(value, { style: "currency", currency: "USD", notation: "standard" });
	const router = useRouter();
	const searchParams = useSearchParams();
	const shouldReduceMotion = useReducedMotion();
	const [step, setStep] = useState<"location" | "payment">("location");
	const [countryCode, setCountryCode] = useState(declaredCountryCode ?? "");
	const [locationPreview, setLocationPreview] = useState<LocationPreview | null>(null);
	const [isLocationAcknowledged, setIsLocationAcknowledged] = useState(false);
	const [isReviewingLocation, setIsReviewingLocation] = useState(false);
	const [locationError, setLocationError] = useState<string | null>(null);
	// CONFIG
	// Allow freeform typing. Require a minimum of $5 and a maximum of $1,000,000
	// before enabling the pay button.
	const MIN = 5;
	const MAX = 1000000;
	const FEE_RATE = tierInfo?.current?.feePct
		? tierInfo.current.feePct / 100
		: 0.05;
	const feePercent = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(FEE_RATE * 100);

	// Default to saving the card for faster future top-ups. Encourage
	// Save & Pay by making it the default and hiding the one-off option
	// behind a small toggle.
	const [mode, setMode] = useState<"oneoff" | "pay_and_save">("pay_and_save");

	const [isLoading, setIsLoading] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	// Use a string for the raw input so the user can freely delete/enter
	// characters (empty string, partial decimals, etc.). Parse it into a
	// number when needed for validation and calculations.
	const [rawAmount, setRawAmount] = useState<string>(() => formatInputAmount(25, locale));
	const quickPickScrollerRef = useRef<HTMLDivElement>(null);
	const quickPickRefs = useRef(new Map<number, HTMLButtonElement>());
	const parsed = useMemo(() => {
		const n = parseLocaleAmount(rawAmount, locale);
		return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
	}, [locale, rawAmount]);

	const amount = parsed; // for backwards-compat uses below
	// When the input is empty or invalid, show $0 as the credits amount
	// Fee = max($1, 5% of amount)
	const fee = useMemo(() => {
		if (Number.isNaN(parsed)) return 0;
		const calc = Math.max(parsed * FEE_RATE, 1);
		return Math.round(calc * 100) / 100;
	}, [FEE_RATE, parsed]);

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
		? formatUSD(0, locale)
		: numericOutOfBounds
		? "--"
		: formatUSD(parsed, locale);
	const feeDisplay = inputEmpty
		? formatUSD(0, locale)
		: numericOutOfBounds
		? "--"
		: formatUSD(fee, locale);
	const totalDisplay = inputEmpty
		? formatUSD(0, locale)
		: numericOutOfBounds
		? "--"
		: formatUSD(total, locale);

	useEffect(() => {
		if (step !== "payment") return;
		let frame = 0;
		const centerSelectedAmount = () => {
			window.cancelAnimationFrame(frame);
			frame = window.requestAnimationFrame(() => {
				const scroller = quickPickScrollerRef.current;
				const selectedValue = QUICK_PICKS.find((value) => Math.abs(value - amount) < 0.001) ?? 25;
				const selected = quickPickRefs.current.get(selectedValue);
				if (!scroller || !selected) return;
				const scrollerRect = scroller.getBoundingClientRect();
				const selectedRect = selected.getBoundingClientRect();
				const selectedOffset = selectedRect.left - scrollerRect.left + scroller.scrollLeft;
				scroller.scrollLeft = selectedOffset - (scroller.clientWidth - selectedRect.width) / 2;
			});
		};
		const scroller = quickPickScrollerRef.current;
		centerSelectedAmount();
		const resizeObserver = scroller ? new ResizeObserver(centerSelectedAmount) : null;
		if (scroller) resizeObserver?.observe(scroller);
		return () => {
			window.cancelAnimationFrame(frame);
			resizeObserver?.disconnect();
		};
	}, [amount, step]);

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

	async function reviewPurchaseLocation() {
		const workspaceId = String(wallet?.workspace_id ?? "").trim();
		if (!countryCode) {
			setLocationError(text("countryRequired"));
			return;
		}
		setIsReviewingLocation(true);
		setIsLocationAcknowledged(false);
		setLocationError(null);
		try {
			const data = await ReviewPurchaseLocation({
				countryCode,
				workspaceId: workspaceId || null,
			});
			setLocationPreview(data as LocationPreview);
			captureProductEvent("credits_purchase_location_reviewed", {
				country_code: countryCode,
				restricted_model_count: data.restrictedModels?.length ?? 0,
				region_restricted_model_count: data.regionRestrictedModels?.length ?? 0,
			});
		} catch {
			setLocationError(text("availabilityReviewFailed"));
		} finally {
			setIsReviewingLocation(false);
		}
	}

	function closeDialog() {
		setStep("location");
		setCountryCode(declaredCountryCode ?? "");
		setLocationPreview(null);
		setIsLocationAcknowledged(false);
		setLocationError(null);
		onClose();
	}

	async function handlePay() {
		if (disabled || !locationPreview || locationPreview.countryCode !== countryCode) return;
		setErr(null);
		setIsLoading(true);

		const hasSavedPaymentMethods =
			(stripeInfo?.paymentMethods?.length ?? 0) > 0 ||
			Boolean(stripeInfo?.hasPaymentMethod);
		const isFirstCardAndFirstPaymentClick =
			selectedPm === "new" &&
			mode === "pay_and_save" &&
			!hasSavedPaymentMethods;
		if (isFirstCardAndFirstPaymentClick) {
			trackFirstPaymentSaveCardClick({
				creditsAmountUsd: parsed,
				feeUsd: fee,
				totalUsd: total,
			});
		}
		captureProductEvent("credits_checkout_started", {
			amount_usd: total,
			currency: "usd",
			mode,
			payment_method: selectedPm === "new" ? "new" : "saved",
			country_code: countryCode,
		});

		// Update URL to indicate a payment attempt is in progress so the
		// parent page can show a processing banner. Use a short unique-ish
		// value (timestamp) to avoid caching and allow multiple attempts.
		try {
			const params = new URLSearchParams(searchParams?.toString() ?? "");
			params.set("payment_attempt", String(Date.now()));
			const url = `${window.location.pathname}?${params.toString()}`;
			// push a new history entry without reloading the page
			router.push(url);
		} catch {
			// non-fatal; continue
		}
		try {
			const clientUserId =
				(window as any).__USER_ID__ || document?.body?.dataset?.userId;
			const workspaceId = wallet?.workspace_id ?? null;

			if (selectedPm && selectedPm !== "new") {
				const response = await ChargeSavedPayment({
					payment_method_id: selectedPm,
					amount_pence: Math.round(total * 100),
					kind: mode,
					user_id: clientUserId ?? null,
					event_type: "top_up",
					workspace_id: workspaceId,
					country_code: countryCode,
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
						if (!stripe) throw new Error("stripe_unavailable");
						const { error } = await stripe.handleNextAction({
							clientSecret: piClientSecret,
						});
						if (error) {
							toast.error(text("authenticationFailed"), {
								description: text("authenticationFailedDescription"),
							});
							setIsLoading(false);
							return; // don't fall through
						}
						toast.success(text("authenticated"), {
							description: text("finishingPayment"),
						});
						closeDialog();
						return; // don't fall through
					}
					// If we got 402 but no client secret, treat as a decline
					toast.error(text("paymentDeclined"), {
						description: text("paymentDeclinedDescription"),
					});
					setIsLoading(false);
					return;
				}

				// --- 2xx: succeeded or processing ---
				if (ok) {
					const status = (data?.status || "").toLowerCase();
					if (status === "succeeded") {
						captureProductEvent("credits_payment_succeeded", {
							amount_usd: total,
							currency: "usd",
							mode,
							payment_method: "saved",
						});
						toast.success(text("paymentSuccessful"));
						closeDialog();
						return; // don't fall through
					}
					if (
						status === "processing" ||
						status === "requires_capture"
					) {
						toast.message(text("paymentProcessing"), {
							description: text("balanceUpdateShortly"),
						});
						closeDialog();
						return; // don't fall through
					}
					// Unexpected ok status - treat as success-ish and let the webhook settle it
					closeDialog();
					return; // don't fall through
				}

				// --- Non-402 error (e.g., 4xx/5xx) ---
				toast.error(text("paymentFailed"), {
					description: text("paymentFailedDescription"),
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
					charge_immediately: true,
					save_payment_method: mode === "pay_and_save",
					user_id: clientUserId ?? null,
					workspace_id: workspaceId,
					country_code: countryCode,
				}),
			});

			const data = await response.json();
			if (!response.ok) {
				throw new Error(
					data?.error || data?.message || `Server ${response.status}`
				);
			}
			if (data.url) window.location.href = data.url;
		} catch {
			setErr(text("genericPaymentFailure"));
		} finally {
			setIsLoading(false);
		}
	}
	const selectedCountryName = countryCode
		? new Intl.DisplayNames([locale], { type: "region" }).of(countryCode) ??
			COUNTRY_OPTIONS.find((country) => country.code === countryCode)?.name ??
			countryCode
		: "";

	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (value) return;
				closeDialog();
			}}
		>
			<DialogContent className="sm:max-w-lg p-0 overflow-hidden">
				{/* Remove number input spinners for the amount input */}
				<style>{`#amount::-webkit-outer-spin-button, #amount::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; } #amount { -moz-appearance: textfield; }`}</style>
				<DialogTitle className="sr-only">
					{step === "location" ? text("confirmLocation") : text("topUpCredits")}
				</DialogTitle>
				<DialogDescription className="sr-only">
					{step === "location"
						? text("locationDescription")
						: text("checkoutDescription")}
				</DialogDescription>
				<motion.div
					className="w-full min-w-0"
					layout="size"
					transition={shouldReduceMotion
						? { duration: 0 }
						: { layout: { duration: 0.26, ease: [0.65, 0, 0.35, 1] } }}
				>
					<AnimatePresence
						initial={false}
						mode="popLayout"
						custom={shouldReduceMotion ? 0 : step === "payment" ? 1 : -1}
					>
						<motion.div
							key={step}
							className="w-full min-w-0"
							custom={shouldReduceMotion ? 0 : step === "payment" ? 1 : -1}
							variants={CHECKOUT_STEP_VARIANTS}
							initial="initial"
							animate="animate"
							exit="exit"
							transition={shouldReduceMotion
								? { duration: 0 }
								: { duration: 0.22, ease: [0.33, 1, 0.68, 1] }}
						>
				{step === "location" ? (
					<PurchaseLocationStep
						countryCode={countryCode}
						countryName={selectedCountryName}
						error={locationError}
						isAcknowledged={isLocationAcknowledged}
						isReviewing={isReviewingLocation}
						onAcknowledgedChange={setIsLocationAcknowledged}
						onContinue={() => {
							if (!isLocationAcknowledged) return;
							captureProductEvent("credits_purchase_location_acknowledged", {
								country_code: countryCode,
								restricted_model_count: locationPreview?.restrictedModels.length ?? 0,
								region_restricted_model_count: locationPreview?.regionRestrictedModels.length ?? 0,
							});
							setStep("payment");
						}}
						onCountryChange={(value) => {
							setCountryCode(value);
							setLocationPreview(null);
							setIsLocationAcknowledged(false);
							setLocationError(null);
						}}
						onReview={reviewPurchaseLocation}
						preview={locationPreview}
					/>
				) : (
					<>
				{/* Header */}
				<div className="px-6 pt-6">
					<DialogHeader className="space-y-1">
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="-ml-2 rounded-md text-muted-foreground hover:text-foreground"
								onClick={() => setStep("location")}
								aria-label={text("backToLocation")}
							>
								<ArrowLeft className="size-4" />
							</Button>
							<h2 aria-hidden="true" className="font-heading text-xl leading-none font-medium">{text("topUpCredits")}</h2>
						</div>
						<p aria-hidden="true" className="text-sm text-muted-foreground">
							{text("checkoutDescription")}
						</p>
					</DialogHeader>
				</div>

				{/* Body - single column */}
				<div className="min-w-0 space-y-4 px-6 pb-5">
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
										{text("paymentType")}
									</div>
									<div className="flex items-center gap-3">
									<div className="text-xs text-muted-foreground">
										{text("useOneOff")}
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
											aria-label={text("useOneOff")}
										/>
									</div>
								</div>
								<p className="text-xs text-muted-foreground">
									{mode === "pay_and_save"
										? text("savedCardDescription")
										: text("oneOffDescription")}
								</p>
							</section>
						</>
					) : null}

					<Separator />

					{/* 3. Amount */}
					<section className="space-y-4" aria-label={text("chooseAmount")}>
						<div
							ref={quickPickScrollerRef}
							className="no-scrollbar grid w-full min-w-0 grid-flow-col auto-cols-[calc((100%-1.5rem)/4)] gap-2 overflow-x-auto pb-1 overscroll-x-contain [scrollbar-width:none]"
						>
							{QUICK_PICKS.map((v) => (
								<Button
									key={v}
									ref={(node) => {
										if (node) quickPickRefs.current.set(v, node);
										else quickPickRefs.current.delete(v);
									}}
									type="button"
									variant="outline"
									size="sm"
									className={cn(
										"w-full rounded-md bg-muted/20 px-1 text-xs sm:text-sm",
										!Number.isNaN(amount) && Math.abs(amount - v) < 0.001
											? "border-foreground !bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background"
											: "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
									)}
									onClick={() => {
										setRawAmount(formatInputAmount(v, locale));
									}}
								>
									{format.number(v, {
										style: "currency",
										currency: "USD",
										maximumFractionDigits: 0,
										notation: "standard",
									})}
								</Button>
							))}
						</div>

						<div className="flex items-center">
							{/* Seamless amount control: joined buttons + input (full width) with rounded focus ring */}
							<div className="inline-flex w-full items-center overflow-hidden rounded-lg border border-border bg-muted/20 transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
								{/* Currency badge in place of left button */}
								<div className="flex h-10 w-10 items-center justify-center border-r border-border text-sm font-medium text-muted-foreground">
									{new Intl.NumberFormat(locale, {
										style: "currency",
										currency: "USD",
									}).formatToParts(0).find((part) => part.type === "currency")?.value ?? "USD"}
								</div>

								<div className="relative flex-1">
									<label htmlFor="amount" className="sr-only">
										{text("amountInDollars")}
									</label>
									{/* remove extra left padding because badge occupies the left */}
									<Input
										id="amount"
										inputMode="decimal"
										type="text"
										className="w-full rounded-none border-0 bg-transparent pl-4 pr-6 text-right text-lg focus:outline-none focus-visible:ring-0 dark:focus-visible:ring-0"
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
													formatInputAmount(parsed, locale)
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
								{text("minimumCreditPurchase", { amount: formatUSD(MIN, locale) })}
							</div>
						) : !Number.isNaN(parsed) && parsed > MAX ? (
							<div className="text-sm text-red-600">
								{text("maximumTopUp", { amount: formatUSD(MAX, locale) })}
							</div>
						) : !Number.isNaN(parsed) &&
							parsed + fee > TOTAL_CAP ? (
							<div className="text-sm text-red-600">
								{text("totalCapExceeded", { amount: formatUSD(TOTAL_CAP, locale) })}
							</div>
						) : null}

						{/* Cost breakdown pill */}
						<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
							<div className="flex items-center gap-2">
								<span>{text("credits")}</span>
								<span className="font-medium">
									{creditsDisplay}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">
									{text("topUpFee")}
								</span>
								<Popover>
									<PopoverTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											aria-label={text("serviceFeeInfo")}
									className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
										>
											<Info className="size-4" />
										</Button>
									</PopoverTrigger>
									<PopoverContent
										side="top"
										sideOffset={6}
										className="w-72 gap-0 rounded-lg p-3 text-left text-xs leading-relaxed"
									>
										{text("feeDescription", {
											percent: feePercent,
											minimumFee: formatUSD(1, locale),
										})}
									</PopoverContent>
								</Popover>
								<span className="font-medium">
									{feeDisplay}
								</span>
							</div>
						</div>
					</section>

					{err && (
					<div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
							{err}
						</div>
					)}
				</div>

				{/* Sticky footer (review & pay) */}
				<div className="sticky bottom-0 w-full border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/90">
					<div className="px-6 py-3 flex items-center justify-between gap-3">
						<div className="text-sm">
							<div className="text-muted-foreground">{text("total")}</div>
							<div className="text-base font-semibold">
								{totalDisplay}
							</div>
						</div>

						<div className="flex items-center gap-2">
							<DialogClose asChild>
								<Button className="rounded-md" variant="secondary">{text("cancel")}</Button>
							</DialogClose>

							<Button
								className="min-w-48 rounded-md bg-foreground text-background hover:bg-foreground/90 hover:text-background"
								disabled={disabled}
								onClick={handlePay}
							>
								{isLoading ? (
									<span className="inline-flex items-center gap-2">
										<Spinner className="h-4 w-4" />
										{text("paymentSubmitting")}
									</span>
								) : selectedPm && selectedPm !== "new" ? (
									(() => {
										const sel = (
											stripeInfo?.paymentMethods ?? []
										).find((p: any) => p.id === selectedPm);
										const brand = formatCardBrand(sel?.card?.brand);
										const last4 =
											sel?.card?.last4 ?? "****";
										return (
											<>
												{text("payWithSavedCard", { brand })}{" "}
												<SensitiveValue inline reveal={false} label={t("billingCopy.cardNumber")}>****{last4}</SensitiveValue>
											</>
										);
									})()
								) : mode === "oneoff" ? (
									text("continueToCheckout")
								) : (
									text("saveCardAndPay")
								)}
							</Button>
						</div>
					</div>
				</div>
					</>
				)}
						</motion.div>
					</AnimatePresence>
				</motion.div>
			</DialogContent>
		</Dialog>
	);
}
