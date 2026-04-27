import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { isAllowedBenchmarkBaseUrl, runGatewayCompare } from "@/lib/internal/gatewayCompare";

const trustedBaseUrlSchema = z.string().url().refine(
	(value) => isAllowedBenchmarkBaseUrl(value),
	"Base URL host is not allowed",
);

const compareRequestSchema = z.object({
	model: z.string().min(1).max(200),
	prompt: z.string().min(1).max(8_000),
	runs: z.number().int().min(1).max(10),
	maxCompletionTokens: z.number().int().min(1).max(512),
	endpoint: z.enum(["chat_completions", "responses"]),
	gatewayBaseUrl: trustedBaseUrlSchema.optional(),
	openRouterBaseUrl: trustedBaseUrlSchema.optional(),
});

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

	let rawBody: unknown;
	try {
		rawBody = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = compareRequestSchema.safeParse(rawBody);
	if (!parsed.success) {
		return NextResponse.json(
			{
				error: "Invalid request body",
				details: parsed.error.flatten(),
			},
			{ status: 400 },
		);
	}

	try {
		const result = await runGatewayCompare(parsed.data);
		return NextResponse.json(result, { status: 200 });
	} catch (error) {
		return NextResponse.json(
			{
				error: "Failed to run gateway comparison",
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}
