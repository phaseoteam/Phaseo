import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Proxy to the external API
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'}/api/v1/control/pricing/calculate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Forward auth if needed
                ...(request.headers.get("authorization") ? {
                    "Authorization": request.headers.get("authorization")!
                } : {})
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error: any) {
        console.error("Error calculating pricing:", error);
        return NextResponse.json(
            { ok: false, error: "calculation_failed", message: error.message },
            { status: 500 }
        );
    }
}