"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";

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
	const router = useRouter();

	// Parse the query string on the client and set the initial banner.
	useEffect(() => {
		if (!queryString) return;
		try {
			const params = new URLSearchParams(queryString);
			const checkout = params.get("checkout");
			const payment_attempt = params.get("payment_attempt");

			// If we have a payment_attempt param, show a processing/info
			// banner. This takes precedence over checkout success/cancelled
			// because it indicates an in-progress payment attempt.
			if (payment_attempt) {
				const attemptTs = Number(payment_attempt);
				const successTs = latestPaymentSuccessAt
					? new Date(latestPaymentSuccessAt).getTime()
					: NaN;
				if (
					Number.isFinite(attemptTs) &&
					Number.isFinite(successTs) &&
					successTs >= attemptTs
				) {
					setBanner({
						type: "success",
						message: "Successful payment, happy building.",
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
			if (checkout === "success") {
				setBanner({
					type: "success",
					message:
						"Checkout successful — your credits have been purchased.",
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
							<Button
								variant="ghost"
								size="icon"
								onClick={() => {
									// remove payment-related query params when dismissing banner
									try {
										const params = new URLSearchParams(
											window.location.search
										);
										params.delete("payment_attempt");
										const q = params.toString();
										const url = q
											? `${window.location.pathname}?${q}`
											: window.location.pathname;
										router.replace(url);
									} catch {
										// ignore
									}
									setBanner(null);
								}}
								aria-label="dismiss"
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
					</div>
				</Card>
			) : null}
		</>
	);
}

