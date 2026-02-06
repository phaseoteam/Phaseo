import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
	formatNotionId,
	getSupportConfig,
	mapSupportTicket,
	notionRequest,
} from "@/lib/support/notion";

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user || !user.email) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const config = getSupportConfig();
	if (!config.databaseId) {
		return NextResponse.json(
			{ error: "Missing support database configuration" },
			{ status: 500 }
		);
	}

	try {
		const payload = await notionRequest<{
			results: any[];
		}>(`/databases/${formatNotionId(config.databaseId)}/query`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				page_size: 50,
				filter: {
					property: config.properties.email,
					email: { equals: user.email },
				},
				sorts: [
					{
						timestamp: "last_edited_time",
						direction: "descending",
					},
				],
			}),
		});

		const tickets = (payload.results ?? []).map(mapSupportTicket);
		return NextResponse.json({ tickets });
	} catch (error) {
		console.error("[support] failed to query tickets", error);
		return NextResponse.json(
			{ error: "Failed to load support tickets" },
			{ status: 500 }
		);
	}
}
