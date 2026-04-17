"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";

const SUCCESS_BANNER_AUTO_DISMISS_MS = 10_000;

type Banner = {
	type: "success" | "error" | "info";
	message: string;
} | null;

interface Props {
	// raw serialized query string from the page (e.g. "checkout=success")
	queryString?: string | null;
	latestPaymentSuccessAt?: string | null;
}

export default function Banner({
	queryString,
	latestPaymentSuccessAt,
}: Props) {
	const [banner, setBanner] = useState<Banner>(null);
	const [successCountdownSeconds, setSuccessCountdownSeconds] = useState<number | null>(null);
	const router = useRouter();
	const dismissBanner = useCallback(() => {
		// Clear query state when dismissing banner.
		try {
			const cleanPath = window.location.pathname;
			window.history.replaceState(window.history.state, "", cleanPath);
			router.replace(cleanPath, { scroll: false });
		} catch {
			// ignore
		}
		setBanner(null);
	}, [router]);

	// Parse the query string on the client and set the initial banner.
	useEffect(() => {
		if (!queryString) return;
		try {
			const params = new URLSearchParams(queryString);
			const refund = params.get("refund");
			const checkout = params.get("checkout");
			const kind = params.get("kind");
			const paymentAttempt = params.get("payment_attempt");

			if (refund) {
				setBanner({
					type: refund === "succeeded" ? "success" : "info",
					message:
						refund === "succeeded"
							? "Your refund is confirmed. Most banks post refunds in 5-10 business days."
							: "Your refund request is processing. Once confirmed, most banks post refunds in 5-10 business days.",
				});
				return;
			}

			const attemptTs = Number(paymentAttempt);
			const successTs = latestPaymentSuccessAt
				? new Date(latestPaymentSuccessAt).getTime()
				: NaN;
			const hasConfirmedPayment =
				Number.isFinite(attemptTs) &&
				Number.isFinite(successTs) &&
				successTs >= attemptTs;

			// If we have a payment_attempt param, show a processing/info
			// banner until we have concrete DB-confirmed payment success.
			if (paymentAttempt) {
				if (hasConfirmedPayment) {
					setBanner({
						type: "success",
						message: "Payment confirmed. Your credits have been added.",
					});
				} else {
					setBanner({
						type: "info",
						message:
							"Processing payment - we are attempting to charge your card. Click Refresh to check the latest status.",
					});
				}
				return;
			}

			// Save-only flow has no payment credit; checkout success means setup is complete.
			if (checkout === "success" && kind === "save_only") {
				setBanner({
					type: "success",
					message: "Card saved successfully.",
				});
				return;
			}

			// For payment checkouts without payment_attempt marker, avoid success claims.
			if (checkout === "success") {
				setBanner({
					type: "info",
					message:
						"Checkout completed. Waiting for payment confirmation. Click Refresh to check the latest status.",
				});
			} else if (checkout === "cancelled") {
				setBanner({
					type: "error",
					message: "Checkout cancelled. No charges were made.",
				});
			}
		} catch {
			// ignore parse errors
		}
	}, [queryString, latestPaymentSuccessAt]);

	// Keep a tiny countdown visible while a success banner is auto-dismissing.
	useEffect(() => {
		if (!banner || banner.type !== "success") {
			setSuccessCountdownSeconds(null);
			return;
		}

		const startedAt = Date.now();
		setSuccessCountdownSeconds(Math.ceil(SUCCESS_BANNER_AUTO_DISMISS_MS / 1000));
		const interval = window.setInterval(() => {
			const elapsedMs = Date.now() - startedAt;
			const remainingMs = SUCCESS_BANNER_AUTO_DISMISS_MS - elapsedMs;
			const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
			setSuccessCountdownSeconds(remainingSeconds);
		}, 250);

		return () => window.clearInterval(interval);
	}, [banner]);

	// Auto-dismiss success banners after 10 seconds.
	useEffect(() => {
		if (!banner || banner.type !== "success") return;
		const timer = window.setTimeout(() => {
			dismissBanner();
		}, SUCCESS_BANNER_AUTO_DISMISS_MS);
		return () => window.clearTimeout(timer);
	}, [banner, dismissBanner]);

	return (
		<>
			{banner ? (
				<Card
					className={`p-3 ${
						banner.type === "success"
							? "bg-green-50 text-green-800 border-green-500"
							: banner.type === "info"
								? "bg-blue-50 text-blue-800 border-blue-500"
								: "bg-red-50 text-red-800 border-red-500"
					}`}
				>
					<div className="flex items-center justify-between">
						<div className="text-sm">{banner.message}</div>
						<div className="flex items-center gap-2">
							<div className="relative">
							<Button
								variant="ghost"
								size="icon"
								onClick={dismissBanner}
								aria-label={
									banner.type === "success" && successCountdownSeconds != null
										? `dismiss (auto closes in ${successCountdownSeconds}s)`
										: "dismiss"
								}
							>
								<X className="h-4 w-4" />
							</Button>
								{banner.type === "success" && successCountdownSeconds != null ? (
									<span
										className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-zinc-900 text-white text-[10px] leading-none font-medium tabular-nums flex items-center justify-center px-1"
										aria-hidden="true"
									>
										{successCountdownSeconds}
									</span>
								) : null}
							</div>
						</div>
					</div>
				</Card>
			) : null}
		</>
	);
}
