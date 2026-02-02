import { NextRequest, NextResponse } from "next/server";
import { getPricingModelsCached } from "@/lib/fetchers/pricing/getPricingModels";

export async function GET() {
    try {
        const models = await getPricingModelsCached(false);
        return NextResponse.json({ ok: true, models });
    } catch (error: any) {
        console.error("Error fetching pricing models:", error);
        return NextResponse.json(
            { ok: false, error: "failed", message: error.message },
            { status: 500 }
        );
    }
}
