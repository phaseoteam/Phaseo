import { NextResponse } from "next/server";

export async function POST() {
	return NextResponse.json(
		{ error: "Invoicing is coming soon." },
		{ status: 410 },
	);
}
