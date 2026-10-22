import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { expirePublicModelCatalogueCache, expireTagNow } from "@/lib/cache/revalidateDataTags";

const NO_STORE = { "Cache-Control": "private, no-store" };

function sameSecret(actual: string, expected: string) {
	// Hash both sides so the comparison takes the same time for any length.
	const digest = (value: string) => createHash("sha256").update(value).digest();
	return timingSafeEqual(digest(actual), digest(expected));
}

/**
 * Called by the web-api cron after it purges the Cloudflare catalogue tags, so
 * cached pages and their data refresh together. The next visit to each page
 * renders fresh instead of serving the stale copy.
 */
export async function POST(request: Request) {
	const secret = String(process.env.REVALIDATION_SECRET ?? "").trim();
	if (!secret) return NextResponse.json({ error: "revalidation_not_configured" }, { status: 503, headers: NO_STORE });

	const authorization = request.headers.get("authorization") ?? "";
	if (!sameSecret(authorization, `Bearer ${secret}`)) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
	}

	const body = (await request.json().catch(() => null)) as { scope?: unknown } | null;
	if (body?.scope !== "catalogue") {
		return NextResponse.json({ error: "invalid_scope" }, { status: 400, headers: NO_STORE });
	}

	expirePublicModelCatalogueCache({}, expireTagNow);
	return NextResponse.json({ revalidated: "catalogue" }, { headers: NO_STORE });
}
