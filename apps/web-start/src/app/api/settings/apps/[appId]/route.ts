import { NextResponse } from "next/server";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";

export async function PUT(
	request: Request,
	context: { params: Promise<{ appId: string }> },
) {
	const [{ appId }, account] = await Promise.all([
		context.params,
		getServerAccountContext(),
	]);
	if (!account.accessToken) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}

	try {
		const result = await fetchAccountWebApi<Record<string, unknown>>(
			`/api/account/settings/apps/${encodeURIComponent(appId)}`,
			account.accessToken,
			{ method: "PUT", body: await request.text() },
		);
		return NextResponse.json(result);
	} catch (error) {
		if (error instanceof WebApiError) {
			return NextResponse.json(
				{ error: error.detail ?? "app_update_failed" },
				{ status: error.status },
			);
		}
		return NextResponse.json({ error: "app_update_failed" }, { status: 500 });
	}
}
