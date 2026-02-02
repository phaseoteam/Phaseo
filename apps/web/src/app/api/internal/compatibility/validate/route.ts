import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
	validateCompatibility,
	type CompatibilityTarget,
} from "@/lib/internal/compatibility/validators";

type ValidateRequest = {
	target: CompatibilityTarget;
	payload: unknown;
};

function isTarget(value: unknown): value is CompatibilityTarget {
	return (
		value === "openai.responses" ||
		value === "openai.chat.completions" ||
		value === "anthropic.messages"
	);
}

export async function POST(req: Request) {
	const supabase = await createClient();

	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	if (authError || !user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { data: userData, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.single();

	if (userError || userData?.role !== "admin") {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: ValidateRequest;
	try {
		body = (await req.json()) as ValidateRequest;
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (!isTarget(body?.target)) {
		return NextResponse.json({ error: "Invalid target" }, { status: 400 });
	}

	try {
		const result = await validateCompatibility(body.target, body.payload);
		return NextResponse.json(result, { status: 200 });
	} catch (error) {
		return NextResponse.json(
			{
				error: "Failed to validate payload",
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}

