import { NextResponse } from "next/server";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";

export async function GET() {
	try {
		const models = await fetchFrontendGatewayModels();
		return NextResponse.json({ models }, {
			headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
		});
	} catch {
		return NextResponse.json({ error: "gateway_models_unavailable" }, { status: 503 });
	}
}
