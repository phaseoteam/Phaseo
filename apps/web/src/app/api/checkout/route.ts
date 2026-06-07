import { NextRequest, NextResponse } from "next/server";
import { createStripeCheckoutResponse } from "@/lib/server/createStripeCheckoutResponse";

// Legacy compatibility route. The active UI uses /api/checkout/create.

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const purchaseAmount = Number(body?.purchase_amount_cents);
		const totalAmount = Number(body?.total_amount_cents) || purchaseAmount;
		const requestedWorkspaceId =
			typeof body?.workspace_id === "string" && body.workspace_id.trim().length > 0
				? body.workspace_id.trim()
				: undefined;

		if (!purchaseAmount || Number.isNaN(purchaseAmount) || purchaseAmount < 500) {
			return NextResponse.json(
				{ error: "Invalid purchase amount. Minimum $5 (500 cents)." },
				{ status: 400 },
			);
		}

		return await createStripeCheckoutResponse({
			amountPence: totalAmount,
			currency: "usd",
			kind: "oneoff",
			notificationCheckoutKind: "legacy_checkout",
			originHeader: req.headers.get("origin"),
			refererHeader: req.headers.get("referer"),
			requestedWorkspaceId,
		});
	} catch (err: any) {
		if (err?.message === "unauthorized") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		if (err?.message === "missing_workspace") {
			return NextResponse.json({ error: "Missing workspace" }, { status: 400 });
		}
		return NextResponse.json({ error: err?.message || "unknown" }, { status: 500 });
	}
}
