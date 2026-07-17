import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/oauth/apiBaseUrl";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ revealId: string }> }) {
	const { revealId } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(revealId)) return NextResponse.json({ error: "Invalid reveal identifier" }, { status: 400 });
	const origin = request.headers.get("origin");
	if (origin !== new URL(request.url).origin || request.headers.get("x-phaseo-mcp-reveal") !== "1") {
		return NextResponse.json({ error: "Invalid reveal request" }, { status: 403 });
	}
	const supabase = await createClient();
	const [{ data: { user } }, { data: { session } }] = await Promise.all([
		supabase.auth.getUser(),
		supabase.auth.getSession(),
	]);
	if (!user || !session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const response = await fetch(`${apiBaseUrl()}/oauth/mcp/secret-reveal/reveal`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${session.access_token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ reveal_id: revealId }),
		cache: "no-store",
	});
	const body = await response.json().catch(() => null);
	if (!response.ok) {
		return NextResponse.json({ error: body?.error_description ?? "Secret reveal is unavailable" }, { status: response.status });
	}
	return NextResponse.json({ secrets: body?.secrets ?? {} }, {
		status: 200,
		headers: { "Cache-Control": "no-store", "Pragma": "no-cache" },
	});
}
