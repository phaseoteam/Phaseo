import type { QuickstartRequestContext } from "./requestContext";

type RoutingMode = "price" | "latency" | "throughput";

type QuickstartRoutingPreference = {
	routingMode: RoutingMode | null;
};

const SORT_TO_ROUTING_MODE: Record<string, RoutingMode | null> = {
	default: null,
	pricing: "price",
	latency: "latency",
	throughput: "throughput",
	uptime: null,
};

const normalizeEndpointValue = (value: string | null | undefined) =>
	value ? value.toLowerCase().replace(/^\//, "").replace(/\//g, ".") : "";

function resolveSpeechVoiceForModel(model: string): string {
	const provider = model.split("/")[0]?.toLowerCase();
	if (provider === "xiaomi") return "mimo_default";
	if (provider === "google" || provider === "google-ai-studio") return "Kore";
	if (provider === "elevenlabs" || provider === "eleven-labs") return "rachel";
	return "alloy";
}

export function buildExamplePayload(
	endpoint: string | null | undefined,
	model: string,
) {
	const normalized = normalizeEndpointValue(endpoint);
	switch (normalized) {
		case "responses":
			return {
				model,
				input: "Give me one fun fact about cURL.",
			};
		case "decisions":
		case "decisions.make":
		case "systemone":
		case "system.one":
		case "decision.make":
		case "typed.decisions":
			return {
				model,
				state: {
					customer_message: "I was charged twice and need help with a refund.",
					account_tier: "pro",
					days_waiting: 3,
				},
				questions: {
					department: {
						type: "choice",
						instructions: "Which team should handle this request?",
						criteria: {
							billing: "Payments, invoices, refunds, and duplicate charges.",
							support: "Product usage questions and troubleshooting.",
							sales: "Upgrades and new accounts.",
						},
					},
					is_urgent: {
						type: "noul",
						instructions: "Does this request require urgent handling?",
						criteria: {
							true: "The customer is blocked or the issue is time-sensitive.",
							false: "The request can follow the normal support queue.",
						},
					},
					customer_impact: {
						type: "score",
						instructions: "How severe is the customer impact?",
						criteria: [
							"No impact",
							"Minor inconvenience",
							"Significant impact",
							"Service blocked",
						],
					},
				},
			};
		case "messages":
			return {
				model,
				messages: [
					{ role: "user", content: "Summarize the latest Phaseo metrics." },
				],
				max_tokens: 256,
			};
		case "moderations":
		case "moderations.create":
			return {
				model,
				input: "Check this prompt for safety before routing downstream.",
			};
		case "embeddings":
			return {
				model,
				input: [
					"Route requests across providers with Phaseo.",
					"Monitor latency, throughput, and spend in real time.",
				],
			};
		case "image.generations":
		case "images.generations":
		case "images.generate":
			return {
				model,
				prompt: "Create a cinematic hero image of an AI observability dashboard lit by soft ambient light.",
				size: "1024x1024",
				quality: "high",
			};
		case "images.edits":
		case "images.edit":
		case "image.edits":
			return {
				model,
				prompt: "Add a warm sunset glow to the skyline.",
				image_url: "https://assets.phaseo.app/sample-image.png",
			};
		case "video.generations":
		case "video.generation":
			return {
				model,
				prompt: "An engineer exploring a real-time operations room, charts updating smoothly, confident tone.",
				duration_seconds: 6,
				aspect_ratio: "16:9",
			};
		case "music.generate":
			return {
				model,
				prompt: "Create a calm, futuristic ambient loop for a dashboard intro.",
				duration_seconds: 20,
			};
		case "audio.speech":
			return {
				model,
				voice: resolveSpeechVoiceForModel(model),
				input: "Welcome to the Phaseo Gateway where latency, uptime, and pricing are in your control.",
				response_format: "mp3",
			};
		case "audio.realtime":
			return {
				model,
				input: "Start a realtime voice session for live support.",
			};
		case "audio.transcriptions":
		case "audio.transcription":
			return {
				model,
				audio_url: "https://assets.phaseo.app/sample-audio.wav",
				language: "en",
			};
		case "audio.translations":
		case "audio.translation":
			return {
				model,
				audio_url: "https://assets.phaseo.app/sample-audio.wav",
				target_language: "en",
			};
		case "batch.create":
		case "batch":
			return {
				input_file_id: "file_abc123",
				endpoint: "/responses",
				completion_window: "24h",
			};
		case "parse":
			return {
				model,
				document: {
					type: "image_url",
					image_url: "https://cohere.com/favicon-32x32.png",
				},
				output_format: "markdown",
			};
		default:
			return {
				model,
				messages: [
					{ role: "system", content: "You are a helpful assistant." },
					{
						role: "user",
						content: "Give me one fun fact about cURL.",
					},
				],
			};
	}
}

export function resolveRoutingPreference(
	requestContext?: QuickstartRequestContext,
): QuickstartRoutingPreference | null {
	const sortKey = String(requestContext?.sort ?? "").trim().toLowerCase();
	if (!sortKey || !(sortKey in SORT_TO_ROUTING_MODE)) return null;

	const routingMode = SORT_TO_ROUTING_MODE[sortKey];
	if (routingMode) {
		return { routingMode };
	}

	if (sortKey === "uptime") {
		return { routingMode: null };
	}

	return null;
}

export function applyRoutingPreferenceToPayload(
	payload: Record<string, unknown>,
	preference: QuickstartRoutingPreference | null,
) {
	const effectiveSort = preference?.routingMode ?? null;
	if (!effectiveSort) return payload;

	return {
		...payload,
		provider: {
			sort: effectiveSort,
		},
	};
}

export const jsonToPythonLiteral = (json: string) => {
	const value = JSON.parse(json) as unknown;

	const format = (current: unknown, depth: number): string => {
		const indent = "  ".repeat(depth);
		const childIndent = "  ".repeat(depth + 1);

		if (current === null) return "None";
		if (typeof current === "boolean") return current ? "True" : "False";
		if (typeof current === "string") return JSON.stringify(current);
		if (typeof current === "number") return String(current);

		if (Array.isArray(current)) {
			if (current.length === 0) return "[]";
			return `[
${current.map((item) => `${childIndent}${format(item, depth + 1)}`).join(",\n")}
${indent}]`;
		}

		if (typeof current === "object") {
			const entries = Object.entries(current as Record<string, unknown>);
			if (entries.length === 0) return "{}";
			return `{
${entries
				.map(([key, item]) => `${childIndent}${JSON.stringify(key)}: ${format(item, depth + 1)}`)
				.join(",\n")}
${indent}}`;
		}

		return "None";
	};

	return format(value, 0);
};

export const buildStreamingDiff = (payloadJson: string) => {
	const lines = payloadJson.split("\n");
	const diffLines = lines.map((line) => ` ${line}`);
	const indentMatch = lines[1]?.match(/^\s*/);
	const indent = indentMatch ? indentMatch[0] : "  ";
	const insertIndex = lines.findIndex((line) => line.includes('"model"'));
	const targetIndex = insertIndex >= 0 ? insertIndex + 1 : 1;
	diffLines.splice(targetIndex, 0, `+${indent}"stream": true,`);
	return diffLines.join("\n");
};
