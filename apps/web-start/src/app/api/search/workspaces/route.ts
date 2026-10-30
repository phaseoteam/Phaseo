import { NextResponse } from "next/server";

import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";

export async function GET() {
	try {
		const data = await fetchInternalAuthHeaderData();
		const workspaces = data.isLoggedIn
			? data.teams.map(({ id, name }) => ({ id, name }))
			: [];

		return NextResponse.json(
			{ workspaces },
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	} catch {
		return NextResponse.json(
			{ workspaces: [] },
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	}
}
