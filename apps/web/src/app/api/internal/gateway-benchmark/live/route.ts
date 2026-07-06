import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import {
	buildCompareBody,
	buildCompareHeaders,
	type CompareArgs,
	type CompareTarget,
	endpointUrl,
	isAllowedBenchmarkBaseUrl,
	normalizeCompareBaseUrl,
	parseJsonObject,
	parseSseFrame,
} from "@/lib/internal/gatewayCompare";

const LIVE_COMPARE_FETCH_TIMEOUT_MS = 30_000;
const trustedBaseUrlSchema = z.string().url().refine(
	(value) => isAllowedBenchmarkBaseUrl(value),
	"Base URL host is not allowed",
);

      const liveCompareRequestSchema = z.object({
              model: z.string().min(1).max(200),
              prompt: z.string().min(1).max(8_000),
              maxCompletionTokens: z.number().int().min(1).max(512),
              endpoint: z.enum(["chat_completions", "responses"]),
              gatewayBaseUrl: trustedBaseUrlSchema.optional(),
              openRouterBaseUrl: trustedBaseUrlSchema.optional(),
              llmGatewayBaseUrl: trustedBaseUrlSchema.optional(),
              vercelAiGatewayBaseUrl: trustedBaseUrlSchema.optional(),
      });

type LiveCompareEvent =
	| {
			type: "started";
			target: CompareTarget;
	  }
	| {
			type: "headers";
			target: CompareTarget;
			status: number;
			headersMs: number;
	  }
	| {
			type: "delta";
			target: CompareTarget;
			atMs: number;
			text: string;
	  }
	| {
			type: "note";
			target: CompareTarget;
			atMs: number;
			text: string;
	  }
	| {
			type: "done";
			target: CompareTarget;
			status: number;
			totalMs: number;
			firstContentMs: number | null;
	  }
	| {
			type: "error";
			target: CompareTarget;
			status: number;
			headersMs: number;
			totalMs: number;
			message: string;
	  }
	| {
			type: "fatal";
			message: string;
	  };

      const DEFAULT_GATEWAY_BASE_URL = "https://api.phaseo.app/v1";
      const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
      const DEFAULT_LLMGATEWAY_BASE_URL = "https://api.llmgateway.io/v1";
      const DEFAULT_VERCEL_AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

function round1(value: number) {
	return Math.round(value * 10) / 10;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(input, {
			...init,
			signal: controller.signal,
		});
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error(`Live benchmark request timed out after ${timeoutMs} ms`);
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

function extractContentText(frame: any): string {
	const chatContent = frame?.choices?.[0]?.delta?.content;
	if (typeof chatContent === "string") return chatContent;
	if (Array.isArray(chatContent)) {
		return chatContent
			.map((part) => {
				if (typeof part === "string") return part;
				if (part && typeof part.text === "string") return part.text;
				return "";
			})
			.join("");
	}

	if (typeof frame?.delta === "string") return frame.delta;
	if (typeof frame?.response?.output_text === "string") return frame.response.output_text;
	return "";
}

async function ensureAdmin() {
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

	return null;
}

async function streamTarget(
        target: CompareTarget,
        args: Omit<CompareArgs, "runs">,
             keys: {
                     gatewayApiKey: string;
                     openRouterApiKey: string;
                     llmGatewayApiKey: string;
                     vercelAiGatewayApiKey: string;
             },
        send: (event: LiveCompareEvent) => void,
) {
        const apiKey =
                     target === "ai-stats"
                             ? keys.gatewayApiKey
                             : target === "openrouter"
                                     ? keys.openRouterApiKey
                                     : target === "llmgateway"
                                             ? keys.llmGatewayApiKey
                                             : keys.vercelAiGatewayApiKey;
             const baseUrl = normalizeCompareBaseUrl(
                     target === "ai-stats"
                             ? args.gatewayBaseUrl || DEFAULT_GATEWAY_BASE_URL
                             : target === "openrouter"
                                     ? args.openRouterBaseUrl || DEFAULT_OPENROUTER_BASE_URL
                                     : target === "llmgateway"
                                             ? args.llmGatewayBaseUrl || DEFAULT_LLMGATEWAY_BASE_URL
                                             : args.vercelAiGatewayBaseUrl ||
                                                     DEFAULT_VERCEL_AI_GATEWAY_BASE_URL,
             );
	const start = performance.now();
	let headersMs = 0;
	let firstContentMs: number | null = null;
	let preview = "";
	let noteCount = 0;

	send({ type: "started", target });

	try {
		const response = await fetchWithTimeout(endpointUrl(baseUrl, args.endpoint), {
			method: "POST",
			headers: buildCompareHeaders(target, apiKey),
			body: JSON.stringify(buildCompareBody({ ...args, runs: 1 })),
			cache: "no-store",
		}, LIVE_COMPARE_FETCH_TIMEOUT_MS);

		headersMs = round1(performance.now() - start);
		send({
			type: "headers",
			target,
			status: response.status,
			headersMs,
		});

		const reader = response.body?.getReader();
		if (!reader) {
			send({
				type: "error",
				target,
				status: response.status,
				headersMs,
				totalMs: headersMs,
				message: "Missing response body",
			});
			return;
		}

		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			if (!value) continue;

			const text = decoder.decode(value, { stream: true });
			if (preview.length < 500) preview += text.slice(0, 500 - preview.length);
			buffer += text;

			const frames = buffer.split(/\n\n/);
			buffer = frames.pop() ?? "";
			for (const raw of frames) {
				const atMs = round1(performance.now() - start);
				const parsed = parseSseFrame(raw);
				const data = parsed.data.trim();

				if (data === "[DONE]" || !data) continue;

				const json = parseJsonObject(data);
				if (!json) {
					if (noteCount < 4) {
						noteCount += 1;
						send({
							type: "note",
							target,
							atMs,
							text: data.slice(0, 120),
						});
					}
					continue;
				}

				const contentText = extractContentText(json);
				if (contentText) {
					if (firstContentMs === null) firstContentMs = atMs;
					send({
						type: "delta",
						target,
						atMs,
						text: contentText,
					});
				}
			}
		}

		const totalMs = round1(performance.now() - start);
		if (!response.ok) {
			send({
				type: "error",
				target,
				status: response.status,
				headersMs,
				totalMs,
				message: `HTTP ${response.status}: ${preview.slice(0, 500)}`,
			});
			return;
		}

		send({
			type: "done",
			target,
			status: response.status,
			totalMs,
			firstContentMs,
		});
	} catch (error) {
		send({
			type: "error",
			target,
			status: 0,
			headersMs,
			totalMs: round1(performance.now() - start),
			message: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function POST(req: Request) {
	const authResponse = await ensureAdmin();
	if (authResponse) return authResponse;

	let rawBody: unknown;
	try {
		rawBody = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = liveCompareRequestSchema.safeParse(rawBody);
	if (!parsed.success) {
		return NextResponse.json(
			{
				error: "Invalid request body",
				details: parsed.error.flatten(),
			},
			{ status: 400 },
		);
	}

	const gatewayApiKey = process.env.PHASEO_PERFORMANCE_TEST_KEY ?? "";
        const openRouterApiKey =
                process.env.PERFORMANCE_KEY_OPENROUTER ??
                process.env.OPENROUTER_API_KEY ??
                "";
             const llmGatewayApiKey =
                     process.env.PERFORMANCE_KEY_LLMGATEWAY ??
                     process.env.LLM_GATEWAY_API_KEY ??
                     "";
             const vercelAiGatewayApiKey =
                     process.env.PERFORMANCE_KEY_VERCEL_AI_GATEWAY ??
                     process.env.VERCEL_AI_GATEWAY_API_KEY ??
                     "";

	if (!gatewayApiKey || !openRouterApiKey) {
		return NextResponse.json(
			{
				error: "Missing PHASEO_PERFORMANCE_TEST_KEY or PERFORMANCE_KEY_OPENROUTER in server environment.",
			},
			{ status: 500 },
		);
	}

	const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                        const encoder = new TextEncoder();
                        let closed = false;
                            const targets: CompareTarget[] = ["ai-stats", "openrouter"];
                            if (llmGatewayApiKey) {
                                    targets.push("llmgateway");
                            }
                            if (vercelAiGatewayApiKey) {
                                    targets.push("vercel-ai-gateway");
                            }
                        const send = (event: LiveCompareEvent) => {
                                if (closed) return;
                                controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
                        };

                        void Promise.all(
                                targets.map((target) =>
                                        streamTarget(
                                                target,
                                                parsed.data,
                                                    {
                                                            gatewayApiKey,
                                                            openRouterApiKey,
                                                            llmGatewayApiKey,
                                                            vercelAiGatewayApiKey,
                                                    },
                                                    send,
                                            ),
                                    ),
                        )
                                .catch((error) => {
                                        send({
                                                type: "fatal",
						message: error instanceof Error ? error.message : String(error),
					});
				})
				.finally(() => {
					closed = true;
					controller.close();
				});
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "application/x-ndjson; charset=utf-8",
			"Cache-Control": "no-store",
			Connection: "keep-alive",
		},
	});
}
