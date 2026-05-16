import { NextResponse } from "next/server";
import { getPricingModelsCached } from "@/lib/fetchers/pricing/getPricingModels";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";

export async function GET() {
    try {
        const models = await getPricingModelsCached(false);
        return NextResponse.json(
            { ok: true, models },
            { headers: PUBLIC_CDN_CACHE_HEADERS }
        );
    } catch (error: any) {
        console.error("Error fetching pricing models:", error);
        return NextResponse.json(
            { ok: false, error: "failed", message: error.message },
            { status: 500 }
        );
    }
}
