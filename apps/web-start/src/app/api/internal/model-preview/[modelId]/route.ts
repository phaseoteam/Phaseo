import { NextResponse } from "next/server";
import { isAdminViewer } from "@/lib/auth/getViewerRole";
import { fetchAdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";
import { toAdminModelPreview } from "@/lib/models/adminModelPreview";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(_request: Request, { params }: { params: Promise<{ modelId: string }> }) {
	if (!(await isAdminViewer().catch(() => false))) {
		return new NextResponse(null, { status: 404, headers: PRIVATE_HEADERS });
	}
	const { modelId } = await params;
	const source = await fetchAdminModelSource(modelId).catch(() => null);
	const preview = source ? toAdminModelPreview(source) : null;
	if (!preview) return new NextResponse(null, { status: 404, headers: PRIVATE_HEADERS });
	return NextResponse.json(preview, { headers: PRIVATE_HEADERS });
}
