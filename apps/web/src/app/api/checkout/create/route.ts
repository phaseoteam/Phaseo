import { NextRequest, NextResponse } from "next/server";
import { createStripeCheckoutResponse } from "@/lib/server/createStripeCheckoutResponse";

export async function POST(req: NextRequest) {
	try {
		const { kind, amount_pence, currency = "usd", workspace_id } =
			await req.json();
		const requestedWorkspaceId =
			typeof workspace_id === "string" && workspace_id.trim().length > 0
				? workspace_id.trim()
				: undefined;

		return await createStripeCheckoutResponse({
			amountPence:
				typeof amount_pence === "number" ? amount_pence : Number(amount_pence),
			currency,
			kind,
			originHeader: req.headers.get("origin"),
			refererHeader: req.headers.get("referer"),
			requestedWorkspaceId,
		});
	} catch (e: any) {
		if (e?.message === "unauthorized") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		if (e?.message === "missing_workspace") {
			return NextResponse.json({ error: "Missing workspace" }, { status: 400 });
		}
		// eslint-disable-next-line no-console
		console.error("checkout.create route error:", e);
		return NextResponse.json({ error: e.message }, { status: 500 });
	}
}
