import { NextResponse } from "next/server";

export async function GET() {
	return NextResponse.json(
		{
			error: "not_configured",
			message:
				"OAuth protected resource metadata is not configured in this deployment yet.",
		},
		{ status: 501 },
	);
}
