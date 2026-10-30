export type RefundRequestResult = { status?: string; message?: string };

export async function requestCreditRefund(paymentIntentId: string, reason: string): Promise<RefundRequestResult> {
	const response = await fetch("/api/stripe/refunds/request", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ paymentIntentId, reason }),
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(payload?.error ?? "Refund request failed");
	return payload;
}
