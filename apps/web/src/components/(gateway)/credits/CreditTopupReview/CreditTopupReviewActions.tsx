"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CountryCombobox } from "@/components/ui/country-combobox";

export type CreditTopupReviewCopy = {
	confirm: string;
	decline: string;
	continueToPayment: string;
	country: string;
	countryPlaceholder: string;
	countryHelp: string;
	checkoutNotice: string;
	savedCardNotice: string;
	missingTokenTitle: string;
	missingTokenBody: string;
	declinedTitle: string;
	declinedBody: string;
	processingTitle: string;
	processingBody: string;
	failedTitle: string;
	failedBody: string;
	authenticationFailed: string;
	notPending: string;
	genericError: string;
};

type Outcome = "declined" | "processing" | "failed" | "authentication_failed" | "not_pending" | "error";

type PaymentResult =
	| { state: "succeeded" | "processing" }
	| { state: "requires_action"; clientSecret: string }
	| { state: "failed"; reason: string };

async function postJson(path: string, body: Record<string, unknown>) {
	const response = await fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const data = await response.json().catch(() => ({})) as Record<string, any>;
	return { ok: response.ok, status: response.status, data };
}

/**
 * Confirm / Decline (saved card) or Continue to payment (first top-up) for a credit top-up
 * request. Every action is a POST with the token from the emailed or CLI link.
 */
export default function CreditTopupReviewActions(props: {
	id: string;
	token: string;
	flow: "checkout" | "saved_card";
	declaredCountryCode: string | null;
	copy: CreditTopupReviewCopy;
}) {
	const { id, token, flow, declaredCountryCode, copy } = props;
	const router = useRouter();
	const [countryCode, setCountryCode] = useState(declaredCountryCode ?? "");
	const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
	const [outcome, setOutcome] = useState<Outcome | null>(null);

	if (!token) {
		return <Callout tone="warning" title={copy.missingTokenTitle}>{copy.missingTokenBody}</Callout>;
	}

	const base = `/api/credits/topups/${encodeURIComponent(id)}`;
	const needsCountry = !declaredCountryCode;

	async function finishAuthentication(clientSecret: string) {
		const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
		if (!stripe) throw new Error("stripe_unavailable");
		const { error, paymentIntent } = await stripe.handleNextAction({ clientSecret });
		if (error || paymentIntent?.status === "requires_payment_method") return "authentication_failed" as const;
		return "processing" as const;
	}

	async function confirm() {
		setBusy("confirm");
		setOutcome(null);
		try {
			if (flow === "checkout") {
				const { ok, data } = await postJson(`${base}/checkout`, { token, country_code: countryCode || undefined });
				if (ok && typeof data.url === "string") {
					window.location.assign(data.url);
					return;
				}
				setOutcome(ok ? "processing" : data.error === "not_pending" ? "not_pending" : "error");
				if (data.error === "not_pending") router.refresh();
				return;
			}
			const { ok, data } = await postJson(`${base}/confirm`, { token, country_code: countryCode || undefined });
			if (!ok) {
				setOutcome(data.error === "not_pending" ? "not_pending" : "error");
				if (data.error === "not_pending") router.refresh();
				return;
			}
			const payment = data.payment as PaymentResult;
			if (payment.state === "requires_action") {
				setOutcome(await finishAuthentication(payment.clientSecret));
			} else {
				setOutcome(payment.state === "failed" ? "failed" : "processing");
			}
			router.refresh();
		} catch {
			setOutcome("error");
		} finally {
			setBusy(null);
		}
	}

	async function decline() {
		setBusy("decline");
		setOutcome(null);
		try {
			const { ok, data } = await postJson(`${base}/decline`, { token });
			setOutcome(ok ? "declined" : data.error === "not_pending" ? "not_pending" : "error");
			router.refresh();
		} catch {
			setOutcome("error");
		} finally {
			setBusy(null);
		}
	}

	if (outcome === "declined") return <Callout tone="info" role="status" title={copy.declinedTitle}>{copy.declinedBody}</Callout>;
	if (outcome === "processing") return <Callout tone="info" role="status" title={copy.processingTitle}>{copy.processingBody}</Callout>;
	if (outcome === "failed") return <Callout tone="critical" role="alert" title={copy.failedTitle}>{copy.failedBody}</Callout>;
	if (outcome === "authentication_failed") return <Callout tone="critical" role="alert" title={copy.failedTitle}>{copy.authenticationFailed}</Callout>;

	return (
		<div className="space-y-4">
			<Callout tone="info">{flow === "checkout" ? copy.checkoutNotice : copy.savedCardNotice}</Callout>
			{needsCountry ? (
				<div className="space-y-2">
					<label htmlFor="topup-country" className="text-sm font-medium">{copy.country}</label>
					<CountryCombobox
						id="topup-country"
						value={countryCode}
						onValueChange={setCountryCode}
						disabled={busy !== null}
						placeholder={copy.countryPlaceholder}
					/>
					<p className="text-xs leading-5 text-muted-foreground">{copy.countryHelp}</p>
				</div>
			) : null}
			{outcome === "not_pending" ? <Callout tone="warning" role="alert">{copy.notPending}</Callout> : null}
			{outcome === "error" ? <Callout tone="critical" role="alert">{copy.genericError}</Callout> : null}
			<div className="flex flex-wrap gap-2">
				<Button className="rounded-md" onClick={confirm} disabled={busy !== null || !countryCode}>
					{flow === "checkout" ? copy.continueToPayment : copy.confirm}
				</Button>
				<Button className="rounded-md" variant="outline" onClick={decline} disabled={busy !== null}>
					{copy.decline}
				</Button>
			</div>
		</div>
	);
}
