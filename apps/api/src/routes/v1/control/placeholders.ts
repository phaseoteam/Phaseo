// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@/pipeline/before/guards";
import { json, withRuntime } from "../../utils";
import { keyAliasRoutes } from "./provisioning";

const KNOWN_ENDPOINTS = [
	"chat/completions",
	"responses",
	"messages",
	"embeddings",
	"moderations",
	"audio/speech",
	"audio/transcriptions",
	"audio/translations",
	"images/generations",
	"images/edits",
	"videos",
	"ocr",
	"music/generate",
	"batches",
	"files",
];

async function handleListEndpoints(req: Request) {
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	try {
		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase
			.from("data_models")
			.select("model_id")
			.eq("hidden", false)
			.order("release_date", { ascending: false })
			.limit(10);

		if (error) {
			throw new Error(error.message || "Failed to list endpoints");
		}

		return json(
			{
				ok: true,
				endpoints: KNOWN_ENDPOINTS,
				sample_models: (data ?? []).map((row) => row.model_id).filter(Boolean),
			},
			200,
			{ "Cache-Control": "no-store" }
		);
	} catch (error: any) {
		return json(
			{ ok: false, error: "failed", message: String(error?.message ?? error) },
			500,
			{ "Cache-Control": "no-store" }
		);
	}
}

export const placeholdersRoutes = new Hono<Env>();

placeholdersRoutes.get("/endpoints", withRuntime(handleListEndpoints));
placeholdersRoutes.route("/", keyAliasRoutes);

