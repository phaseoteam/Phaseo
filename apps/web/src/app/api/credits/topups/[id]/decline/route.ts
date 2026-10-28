import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { decideCreditTopup } from "@/lib/server/creditTopups";

const NO_STORE = { "Cache-Control": "no-store" };

// POST only, like confirm: following the emailed link never changes a request.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	// JSON only, so a cross-site form post cannot reach the handler without a CORS preflight.
	if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
		return NextResponse.json({ error: "unsupported_media_type" }, { status: 415, headers: NO_STORE });
	}
	const supabase = await createClient();
	const { data: { user } } = await supabase.auth.getUser();
	if (!user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

	const body = await req.json().catch(() => ({})) as { token?: unknown };
	const token = typeof body.token === "string" ? body.token.trim() : "";

	try {
		const decision = await decideCreditTopup({ db: createAdminClient(), id, token, userId: user.id, decision: "decline" });
		if (decision.ok === false) return NextResponse.json({ error: decision.error }, { status: decision.httpStatus, headers: NO_STORE });
		if (decision.status !== "declined") {
			return NextResponse.json({ error: "not_pending", status: decision.status, reason: decision.reason }, { status: 409, headers: NO_STORE });
		}
		return NextResponse.json({ status: "declined", reason: decision.reason }, { headers: NO_STORE });
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error("[credit-topups] decline failed", { id, error: error instanceof Error ? error.message : String(error) });
		return NextResponse.json({ error: "decline_failed" }, { status: 500, headers: NO_STORE });
	}
}
