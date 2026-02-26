"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Building2, PenLine } from "lucide-react";

import { saveBillingOnboardingSettings } from "@/app/(dashboard)/settings/credits/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type Props = {
	teamName: string;
	teamTier: string;
	currentBillingMode: "wallet" | "invoice";
	invoiceProfileEnabled: boolean;
	initialBillingDay: number;
	initialPaymentTermsDays: number;
	signerName: string;
};

const BILLING_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const PAYMENT_TERMS = [14, 30] as const;
const HOLD_TO_SIGN_MS = 1600;
const SIGNATURE_PATH_LENGTH = 560;

export default function EnterpriseBillingOnboardingClient(props: Props) {
	const router = useRouter();
	const isEnterprise = props.teamTier.toLowerCase() === "enterprise";
	const isInvoiceActive = props.currentBillingMode === "invoice";
	const [started, setStarted] = React.useState<boolean>(isInvoiceActive);
	const [billingDay, setBillingDay] = React.useState<number>(
		props.initialBillingDay || 1
	);
	const [paymentTermsDays, setPaymentTermsDays] = React.useState<14 | 30>(
		props.initialPaymentTermsDays === 14 ? 14 : 30
	);
	const [saving, setSaving] = React.useState(false);
	const [holdProgressPct, setHoldProgressPct] = React.useState<number>(
		isInvoiceActive ? 100 : 0
	);
	const [holdComplete, setHoldComplete] = React.useState<boolean>(isInvoiceActive);
	const holdStartRef = React.useRef<number | null>(null);
	const holdRafRef = React.useRef<number | null>(null);

	const canSave = React.useMemo(() => {
		if (!isEnterprise || !started) return false;
		const settingsChanged =
			billingDay !== props.initialBillingDay ||
			paymentTermsDays !== (props.initialPaymentTermsDays === 14 ? 14 : 30) ||
			(isInvoiceActive && !props.invoiceProfileEnabled);
		if (isInvoiceActive) return settingsChanged;
		return holdComplete;
	}, [
		isEnterprise,
		started,
		billingDay,
		props.initialBillingDay,
		paymentTermsDays,
		props.initialPaymentTermsDays,
		isInvoiceActive,
		props.invoiceProfileEnabled,
		holdComplete,
	]);

	const safeSignerName = React.useMemo(() => {
		const trimmed = String(props.signerName ?? "").trim();
		if (trimmed.length >= 2) return trimmed;
		return "Authorized Signer";
	}, [props.signerName]);

	React.useEffect(() => {
		return () => {
			if (holdRafRef.current != null) {
				cancelAnimationFrame(holdRafRef.current);
			}
		};
	}, []);

	const runHoldAnimation = React.useCallback(() => {
		const startAt = holdStartRef.current;
		if (startAt == null) return;

		const tick = (now: number) => {
			const elapsed = now - startAt;
			const progress = Math.min(100, (elapsed / HOLD_TO_SIGN_MS) * 100);
			setHoldProgressPct(progress);

			if (progress >= 100) {
				setHoldComplete(true);
				holdStartRef.current = null;
				holdRafRef.current = null;
				return;
			}

			holdRafRef.current = requestAnimationFrame(tick);
		};

		holdRafRef.current = requestAnimationFrame(tick);
	}, []);

	function startHold() {
		if (isInvoiceActive || holdComplete || saving) return;
		if (holdRafRef.current != null) {
			cancelAnimationFrame(holdRafRef.current);
		}
		holdStartRef.current = performance.now();
		runHoldAnimation();
	}

	function cancelHold() {
		if (isInvoiceActive || holdComplete || saving) return;
		if (holdRafRef.current != null) {
			cancelAnimationFrame(holdRafRef.current);
			holdRafRef.current = null;
		}
		holdStartRef.current = null;
		setHoldProgressPct(0);
	}

	async function handleSave() {
		if (!isEnterprise) {
			toast.error("Invoiced billing is available for Enterprise teams only.");
			return;
		}
		if (!started) {
			toast.error("Start invoiced billing first.");
			return;
		}
		if (!isInvoiceActive && !holdComplete) {
			toast.error("Please press and hold to sign the invoiced billing terms.");
			return;
		}

		setSaving(true);
		try {
			await toast.promise(
				saveBillingOnboardingSettings({
					billingDay,
					paymentTermsDays,
					termsAccepted: isInvoiceActive ? true : holdComplete,
					signedByName: safeSignerName,
				}),
				{
					loading: "Saving billing setup...",
					success: "Billing setup saved",
					error: (err: any) => err?.message ?? "Failed to save billing setup",
				}
			);
			router.push("/settings/credits");
			router.refresh();
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="mx-auto max-w-2xl space-y-7">
			<div className="space-y-2">
				<div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					<Building2 className="h-3.5 w-3.5" />
					Invoiced Billing
				</div>
				<h2 className="text-2xl font-semibold tracking-tight">
					{isInvoiceActive ? "Invoiced billing is active" : "Start invoiced billing"}
				</h2>
				<p className="text-sm text-muted-foreground">
					Configure post-usage billing for{" "}
					<span className="font-medium text-foreground">{props.teamName}</span>.
				</p>
			</div>

			{!isEnterprise ? (
				<p className="text-sm text-muted-foreground">
					This team is on the{" "}
					<span className="font-medium text-foreground">{props.teamTier}</span>{" "}
					tier. Invoiced billing is available on Enterprise.
				</p>
			) : null}

			{isEnterprise && !started ? (
				<div className="space-y-3">
					<Button onClick={() => setStarted(true)}>
						Start Invoiced Billing
						<ArrowRight className="ml-2 h-4 w-4" />
					</Button>
					<p className="text-xs text-muted-foreground">
						Invoiced billing is permanent once enabled.
					</p>
				</div>
			) : null}

			{isEnterprise && started ? (
				<div className="space-y-6 border-t pt-6">
					<div className="grid gap-4 md:grid-cols-2">
						<div className="grid gap-2">
							<Label htmlFor="billing-day">Billing day</Label>
							<Select
								value={String(billingDay)}
								onValueChange={(v) => setBillingDay(Number(v))}
							>
								<SelectTrigger id="billing-day">
									<SelectValue placeholder="Choose billing day" />
								</SelectTrigger>
								<SelectContent>
									{BILLING_DAYS.map((day) => (
										<SelectItem key={day} value={String(day)}>
											Day {day}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="payment-terms">Payment terms</Label>
							<Select
								value={String(paymentTermsDays)}
								onValueChange={(v) => setPaymentTermsDays(v === "14" ? 14 : 30)}
							>
								<SelectTrigger id="payment-terms">
									<SelectValue placeholder="Choose terms" />
								</SelectTrigger>
								<SelectContent>
									{PAYMENT_TERMS.map((days) => (
										<SelectItem key={days} value={String(days)}>
											Net {days}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="space-y-3 rounded-lg border bg-muted/25 p-4">
						<p className="text-sm font-medium">By enabling invoiced billing, you agree:</p>
						<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
							<li>Invoices are issued monthly based on gateway usage.</li>
							<li>Payment is due under the selected Net terms.</li>
							<li>Invoiced billing cannot be switched back to wallet mode.</li>
							<li>Delinquent invoices may result in service restrictions.</li>
						</ul>
					</div>

					{!isInvoiceActive ? (
						<div className="space-y-3 rounded-lg border p-4">
							<div className="flex items-center gap-2 text-sm font-medium">
								<PenLine className="h-4 w-4" />
								Signature
							</div>
							<p className="text-sm text-muted-foreground">
								Signing as <span className="font-medium text-foreground">{safeSignerName}</span>
							</p>

							<div className="overflow-hidden rounded-md border bg-background">
								<svg
									viewBox="0 0 640 120"
									role="img"
									aria-label="Signature preview"
									className="h-20 w-full"
								>
									<path
										d="M30 84 C 70 42, 90 98, 130 70 C 160 52, 182 46, 200 84 C 208 100, 234 84, 250 64 C 266 44, 286 44, 304 78 C 320 106, 348 74, 366 52 C 384 30, 412 42, 426 70 C 444 102, 470 100, 496 68 C 518 42, 542 42, 570 82"
										fill="none"
										stroke="currentColor"
										strokeWidth="3"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeDasharray={SIGNATURE_PATH_LENGTH}
										strokeDashoffset={
											SIGNATURE_PATH_LENGTH -
											(SIGNATURE_PATH_LENGTH * holdProgressPct) / 100
										}
									/>
								</svg>
							</div>

							<Button
								type="button"
								variant={holdComplete ? "secondary" : "default"}
								className="w-full select-none touch-none"
								onPointerDown={startHold}
								onPointerUp={cancelHold}
								onPointerLeave={cancelHold}
								onPointerCancel={cancelHold}
								disabled={saving || holdComplete}
							>
								{holdComplete
									? "Signature captured"
									: `Press and hold to sign (${Math.round(holdProgressPct)}%)`}
							</Button>
						</div>
					) : null}

					<div className="flex items-center justify-between gap-3 border-t pt-4">
						<p className="text-xs text-muted-foreground">
							{isInvoiceActive
								? "Update your billing day and payment terms at any time."
								: "Enable invoiced billing once your signature is captured."}
						</p>
						<Button onClick={handleSave} disabled={saving || !canSave}>
							{saving
								? "Saving..."
								: isInvoiceActive
									? "Save invoice settings"
									: "Enable invoiced billing"}
							<ArrowRight className="ml-2 h-4 w-4" />
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
