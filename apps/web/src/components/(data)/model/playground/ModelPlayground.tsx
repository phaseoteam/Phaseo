"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Streamdown } from "streamdown";
import {
	Clapperboard,
	Code2,
	Clock3,
	Fingerprint,
	FileText,
	ImageIcon,
	Mic,
	MessageSquare,
	ShieldAlert,
	Sparkles,
	TerminalSquare,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import CodeBlock from "@/components/(data)/model/quickstart/CodeBlock";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import {
	buildAudioRequestOptions,
	buildEmbeddingsRequestOptions,
	buildImageRequestOptions,
	buildVideoRequestOptions,
	getDefaultAudioRoomParams,
	getDefaultEmbeddingsRoomParams,
	getDefaultImageRoomParams,
	getDefaultVideoRoomParams,
} from "@/lib/chat/roomModelSettings";
import {
	buildModerationInput,
	extractEmbeddingVectors,
	extractGenerationUrls,
	normalizeModerationResult,
	type NormalizedModerationResult,
} from "@/lib/chat/roomRequestBuilders";
import { extractResponseText } from "@/components/(chat)/chatPayload";
import { extractTotalCostUsd } from "@/components/(chat)/playground/chat-playground-core";
import { BASE_URL } from "@/components/(data)/model/quickstart/config";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import type { ShikiLang } from "@/components/(data)/model/quickstart/shiki";

const PLAYGROUND_APP_HEADERS = {
	"x-app-id": "ai-stats-playground",
	"x-app-name": "AI Stats Playground",
	"x-title": "AI Stats Playground",
	"http-referer": "https://ai-stats.phaseo.app/models",
};

type ModelPlaygroundProps = {
	modelId: string;
	requestModelId?: string;
	modelName: string;
	gatewayModels?: GatewaySupportedModel[];
};

type PlaygroundStats = {
	elapsedMs: number;
	totalTokens: number | null;
	throughputTokensPerSecond: number | null;
	totalCostUsd: string | null;
};

type SseFrame = {
	eventType: string;
	data: string | null;
};

type PlaygroundMode =
	| "text"
	| "audio"
	| "image"
	| "video"
	| "moderation"
	| "embeddings";

type ModeConfig = {
	mode: PlaygroundMode;
	label: string;
};

type PlaygroundCodeSnippet = {
	id: string;
	label: string;
	category:
		| "AI Stats SDK"
		| "OpenAI SDK"
		| "Anthropic SDK"
		| "HTTP"
		| "Raw";
	description: string;
	lang: ShikiLang;
	installCommand?: string;
	code: string;
};

const CODE_CATEGORY_ORDER: PlaygroundCodeSnippet["category"][] = [
	"AI Stats SDK",
	"OpenAI SDK",
	"Anthropic SDK",
	"HTTP",
	"Raw",
];

const MODE_CONFIGS: ModeConfig[] = [
	{ mode: "text", label: "Text" },
	{ mode: "audio", label: "Audio" },
	{ mode: "image", label: "Image" },
	{ mode: "video", label: "Video" },
	{ mode: "embeddings", label: "Embeddings" },
	{ mode: "moderation", label: "Moderation" },
];

function resolveSupportedModelId(
	models: GatewaySupportedModel[],
	preferredModelId: string,
): string {
	if (models.some((entry) => entry.modelId === preferredModelId)) {
		return preferredModelId;
	}
	return models[0]?.modelId ?? "";
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}
	return value;
}

function extractUsage(payload: any): Record<string, unknown> | null {
	const usage =
		payload?.usage ??
		payload?.response?.usage ??
		payload?.response?.output?.usage ??
		null;
	return usage && typeof usage === "object"
		? (usage as Record<string, unknown>)
		: null;
}

function extractMeta(payload: any): Record<string, unknown> | null {
	const meta = payload?.meta ?? payload?.response?.meta ?? null;
	return meta && typeof meta === "object"
		? (meta as Record<string, unknown>)
		: null;
}

function extractTotalTokens(usage: Record<string, unknown> | null): number | null {
	if (!usage) return null;
	const direct =
		toFiniteNumber((usage as any).total_tokens) ??
		toFiniteNumber((usage as any).totalTokens) ??
		toFiniteNumber((usage as any).output_text_tokens) ??
		toFiniteNumber((usage as any).output_tokens) ??
		toFiniteNumber((usage as any).outputTokens);
	if (direct != null) return direct;

	const input =
		toFiniteNumber((usage as any).input_text_tokens) ??
		toFiniteNumber((usage as any).input_tokens) ??
		toFiniteNumber((usage as any).prompt_tokens);
	const output =
		toFiniteNumber((usage as any).output_text_tokens) ??
		toFiniteNumber((usage as any).output_tokens) ??
		toFiniteNumber((usage as any).completion_tokens);
	if (input == null && output == null) return null;
	return (input ?? 0) + (output ?? 0);
}

function extractThroughputTokensPerSecond(
	meta: Record<string, unknown> | null,
	totalTokens: number | null,
	elapsedMs: number,
): number | null {
	const fromMeta =
		toFiniteNumber((meta as any)?.throughput_tps) ??
		toFiniteNumber((meta as any)?.throughput_tokens_per_second) ??
		toFiniteNumber((meta as any)?.throughputTokensPerSecond) ??
		toFiniteNumber((meta as any)?.client?.throughputTokensPerSecond);
	if (fromMeta != null) return fromMeta;
	if (totalTokens == null || elapsedMs <= 0) return null;
	return totalTokens / (elapsedMs / 1000);
}

function formatDuration(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(totalTokens: number | null): string {
	if (totalTokens == null) return "N/A tokens";
	return `${Math.round(totalTokens).toLocaleString()} tokens`;
}

function formatThroughput(tokensPerSecond: number | null): string {
	if (tokensPerSecond == null) return "N/A tok/s";
	return `${tokensPerSecond.toFixed(1)} tok/s`;
}

function formatCost(totalCostUsd: string | null): string {
	if (!totalCostUsd) return "$0.000000";
	const asNumber = Number.parseFloat(totalCostUsd);
	if (!Number.isFinite(asNumber)) return "$0.000000";
	return `$${asNumber.toFixed(6)}`;
}

function parseSseFrame(frame: string): SseFrame {
	const lines = frame.split(/\r?\n/);
	let eventType = "";
	const dataLines: string[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith("event:")) {
			eventType = trimmed.slice(6).trim();
			continue;
		}
		if (trimmed.startsWith("data:")) {
			dataLines.push(trimmed.slice(5).trimStart());
		}
	}
	const data = dataLines.join("").trim();
	return {
		eventType,
		data: data.length > 0 ? data : null,
	};
}

type ParsedPlaygroundError = {
	message: string | null;
	code: string | null;
	type: string | null;
};

function readNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function extractPlaygroundError(
	payload: Record<string, unknown> | null,
): ParsedPlaygroundError {
	if (!payload) {
		return { message: null, code: null, type: null };
	}

	const rootMessage =
		readNonEmptyString(payload.message) ?? readNonEmptyString(payload.description);
	const rootCode =
		readNonEmptyString(payload.code) ??
		(typeof payload.error === "string" ? readNonEmptyString(payload.error) : null);
	const rootType = readNonEmptyString(payload.type);

	const nestedError =
		payload.error && typeof payload.error === "object" && !Array.isArray(payload.error)
			? (payload.error as Record<string, unknown>)
			: null;
	const nestedMessage = nestedError
		? readNonEmptyString(nestedError.message) ??
			readNonEmptyString(nestedError.description) ??
			readNonEmptyString(nestedError.error_description)
		: null;
	const nestedCode = nestedError
		? readNonEmptyString(nestedError.code) ??
			readNonEmptyString(nestedError.errorCode) ??
			readNonEmptyString(nestedError.error_code)
		: null;
	const nestedType = nestedError
		? readNonEmptyString(nestedError.type) ??
			readNonEmptyString(nestedError.errorType) ??
			readNonEmptyString(nestedError.error_type)
		: null;

	return {
		message: nestedMessage ?? rootMessage,
		code: nestedCode ?? rootCode,
		type: nestedType ?? rootType,
	};
}

function mergeFriendlyMessage(
	friendly: string,
	detail: string | null,
): string {
	if (!detail) return friendly;
	const normalizedDetail = detail.trim();
	if (!normalizedDetail) return friendly;
	if (/^request failed \(\d+\)\.?$/i.test(normalizedDetail)) return friendly;
	if (friendly.toLowerCase() === normalizedDetail.toLowerCase()) return friendly;
	return `${friendly} ${normalizedDetail}`;
}

function buildFriendlyPlaygroundError(args: {
	status: number;
	message: string | null;
	code: string | null;
	type: string | null;
}): string | null {
	const haystack = `${args.code ?? ""} ${args.type ?? ""} ${args.message ?? ""}`
		.toLowerCase()
		.trim();
	const isCreditRelated =
		args.status === 402 ||
		haystack.includes("insufficient_funds") ||
		haystack.includes("insufficient fund") ||
		haystack.includes("insufficient_credits") ||
		haystack.includes("insufficient credits") ||
		haystack.includes("out_of_credits") ||
		haystack.includes("out of credits") ||
		haystack.includes("no_credits") ||
		haystack.includes("no credits") ||
		haystack.includes("wallet balance") ||
		haystack.includes("payment_required");
	if (isCreditRelated) {
		return "Insufficient credits for this request. Add credits in Billing and try again.";
	}

	if (args.status === 401 || haystack.includes("unauthorized")) {
		return "Sign in to use the playground, then try again.";
	}

	if (args.status === 403) {
		return "This request is not permitted for your current team or key. Check model access and permissions.";
	}

	if (args.status === 404) {
		return "The model or endpoint was not found. Try another model.";
	}

	const isRateLimitRelated =
		args.status === 429 ||
		haystack.includes("rate_limit") ||
		haystack.includes("rate limit") ||
		haystack.includes("too many requests") ||
		haystack.includes("quota exceeded");
	if (isRateLimitRelated) {
		return "Rate limit reached. Wait a moment and retry.";
	}

	const isGatewayUnavailable =
		args.status === 502 ||
		args.status === 503 ||
		args.status === 504 ||
		haystack.includes("gateway_unreachable") ||
		haystack.includes("gateway unavailable");
	if (isGatewayUnavailable) {
		return "The gateway is temporarily unavailable. Please retry shortly.";
	}

	if (args.status >= 500) {
		return "Temporary server issue. Please retry.";
	}

	return null;
}

async function readErrorMessage(response: Response): Promise<string> {
	const status = response.status;
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		try {
			const payload = (await response.json()) as Record<string, unknown> | null;
			const parsedError = extractPlaygroundError(payload);
			const friendly = buildFriendlyPlaygroundError({
				status,
				message: parsedError.message,
				code: parsedError.code,
				type: parsedError.type,
			});
			if (friendly) {
				return mergeFriendlyMessage(friendly, parsedError.message);
			}
			if (parsedError.message) return parsedError.message;
			if (parsedError.code) return `Request failed (${status}): ${parsedError.code}.`;
			return `Request failed (${status}).`;
		} catch {
			const fallback = buildFriendlyPlaygroundError({
				status,
				message: null,
				code: null,
				type: null,
			});
			return fallback ?? `Request failed (${status}).`;
		}
	}

	const rawText = await response.text();
	const text = rawText.trim();
	if (text) {
		const parsedPayload = parseJsonObject(text);
		if (parsedPayload) {
			const parsedError = extractPlaygroundError(parsedPayload);
			const friendly = buildFriendlyPlaygroundError({
				status,
				message: parsedError.message,
				code: parsedError.code,
				type: parsedError.type,
			});
			if (friendly) {
				return mergeFriendlyMessage(friendly, parsedError.message);
			}
			if (parsedError.message) return parsedError.message;
			if (parsedError.code) return `Request failed (${status}): ${parsedError.code}.`;
		}

		const friendlyFromText = buildFriendlyPlaygroundError({
			status,
			message: text,
			code: null,
			type: null,
		});
		if (friendlyFromText) return friendlyFromText;
		return text;
	}

	const fallback = buildFriendlyPlaygroundError({
		status,
		message: null,
		code: null,
		type: null,
	});
	return fallback ?? `Request failed (${status}).`;
}

function normalizeAudioMimeType(value: unknown): string {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (!normalized) return "audio/mpeg";
	if (normalized.includes("/")) return normalized;
	if (normalized === "mp3") return "audio/mpeg";
	if (normalized === "wav") return "audio/wav";
	if (normalized === "opus") return "audio/opus";
	return "audio/mpeg";
}

function extractAudioDataUrl(payload: any): string | null {
	if (!payload || typeof payload !== "object") return null;
	const audio = payload.audio;
	if (audio && typeof audio === "object") {
		const data = typeof audio.data === "string" ? audio.data.trim() : "";
		const url = typeof audio.url === "string" ? audio.url.trim() : "";
		if (url) return url;
		if (data) {
			const mimeType = normalizeAudioMimeType(
				audio.mime_type ?? payload.mime_type ?? payload.response_format,
			);
			return data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`;
		}
	}
	const directUrl = typeof payload.url === "string" ? payload.url.trim() : "";
	if (directUrl) return directUrl;
	return null;
}

function resolvePromptForSnippet(prompt: string, modelName: string): string {
	const trimmed = prompt.trim();
	if (trimmed) return trimmed;
	return `Give me a concise overview of ${modelName}.`;
}

function jsonToPythonLiteral(json: string): string {
	return json
		.replace(/true/g, "True")
		.replace(/false/g, "False")
		.replace(/null/g, "None");
}

function buildPlaygroundCodeSnippets({
	modelId,
	modelName,
	prompt,
}: {
	modelId: string;
	modelName: string;
	prompt: string;
}): PlaygroundCodeSnippet[] {
	const resolvedPrompt = resolvePromptForSnippet(prompt, modelName);
	const resolvedPromptStringLiteral = JSON.stringify(resolvedPrompt);
	const endpointPath = "/responses";
	const endpointUrl = `${BASE_URL}${endpointPath}`;
	const payload = {
		model: modelId,
		input: [{ role: "user", content: resolvedPrompt }],
	};
	const payloadJson = JSON.stringify(payload, null, 2);
	const payloadJsonNode = payloadJson
		.split("\n")
		.map((line) => `  ${line}`)
		.join("\n");
	const payloadJsonPython = jsonToPythonLiteral(payloadJson);

	return [
		{
			id: "raw-curl",
			label: "cURL",
			category: "Raw",
			description: "Lowest-level HTTP request against the gateway.",
			lang: "bash",
			code: `# 1) Set your key
export AI_STATS_API_KEY="aistats_***"

# 2) Send a request
curl -s ${endpointUrl} \\
  -H "Authorization: Bearer $AI_STATS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${payloadJson}'`,
		},
		{
			id: "typescript-fetch",
			label: "TypeScript",
			category: "HTTP",
			description: "OpenAI-compatible call using native fetch in TS/Node.",
			lang: "ts",
			code: `const apiKey = process.env.AI_STATS_API_KEY;

const response = await fetch("${endpointUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${apiKey}\`,
  },
  body: JSON.stringify(
${payloadJsonNode}
  ),
});

const data = await response.json();
console.log(data);`,
		},
		{
			id: "javascript-fetch",
			label: "JavaScript",
			category: "HTTP",
			description: "OpenAI-compatible call using native fetch in JavaScript.",
			lang: "js",
			code: `const apiKey = process.env.AI_STATS_API_KEY;

const response = await fetch("${endpointUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${apiKey}\`,
  },
  body: JSON.stringify(
${payloadJsonNode}
  ),
});

const data = await response.json();
console.log(data);`,
		},
		{
			id: "python-requests",
			label: "Python",
			category: "HTTP",
			description: "OpenAI-compatible call using Python requests.",
			lang: "python",
			code: `import os
import requests

api_key = os.environ.get("AI_STATS_API_KEY")
url = "${endpointUrl}"
payload = ${payloadJsonPython}

response = requests.post(
    url,
    json=payload,
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    },
)

print(response.json())`,
		},
		{
			id: "rust-reqwest",
			label: "Rust",
			category: "HTTP",
			description: "OpenAI-compatible call using reqwest.",
			lang: "rust",
			installCommand: "cargo add reqwest tokio",
			code: `#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let payload = r#"
${payloadJson}
"#;

    let api_key = std::env::var("AI_STATS_API_KEY")?;
    let client = reqwest::Client::new();

    let response = client
        .post("${endpointUrl}")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .body(payload)
        .send()
        .await?
        .text()
        .await?;

    println!("{}", response);
    Ok(())
}`,
		},
		{
			id: "go-net-http",
			label: "Go",
			category: "HTTP",
			description: "OpenAI-compatible call using Go's standard HTTP client.",
			lang: "go",
			code: `package main

import (
    "bytes"
    "fmt"
    "io"
    "net/http"
    "os"
)

func main() {
    payload := []byte(\`${payloadJson}\`)

    req, err := http.NewRequest("POST", "${endpointUrl}", bytes.NewBuffer(payload))
    if err != nil {
        panic(err)
    }

    req.Header.Set("Authorization", "Bearer "+os.Getenv("AI_STATS_API_KEY"))
    req.Header.Set("Content-Type", "application/json")

    resp, err := (&http.Client{}).Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
}`,
		},
		{
			id: "csharp-http-client",
			label: "C#",
			category: "HTTP",
			description: "OpenAI-compatible call using .NET HttpClient.",
			lang: "csharp",
			code: `using System.Net.Http.Headers;
using System.Text;

var apiKey = Environment.GetEnvironmentVariable("AI_STATS_API_KEY");

using var http = new HttpClient();
using var request = new HttpRequestMessage(HttpMethod.Post, "${endpointUrl}");
request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
request.Content = new StringContent("""
${payloadJson}
""", Encoding.UTF8, "application/json");

var response = await http.SendAsync(request);
var body = await response.Content.ReadAsStringAsync();

Console.WriteLine(body);`,
		},
		{
			id: "java-http-client",
			label: "Java",
			category: "HTTP",
			description: "OpenAI-compatible call using Java HttpClient.",
			lang: "java",
			code: `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class Main {
    public static void main(String[] args) throws Exception {
        String apiKey = System.getenv("AI_STATS_API_KEY");
        String payload = """
${payloadJson}
""";

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("${endpointUrl}"))
            .header("Authorization", "Bearer " + apiKey)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(payload))
            .build();

        HttpClient client = HttpClient.newHttpClient();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        System.out.println(response.body());
    }
}`,
		},
		{
			id: "php-curl",
			label: "PHP",
			category: "HTTP",
			description: "OpenAI-compatible call using PHP cURL.",
			lang: "php",
			code: `<?php
$apiKey = getenv("AI_STATS_API_KEY");
$payload = <<<'JSON'
${payloadJson}
JSON;

$ch = curl_init("${endpointUrl}");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer {$apiKey}",
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_RETURNTRANSFER => true,
]);

$response = curl_exec($ch);
if ($response === false) {
    throw new RuntimeException(curl_error($ch));
}
curl_close($ch);

echo $response . PHP_EOL;`,
		},
		{
			id: "ruby-net-http",
			label: "Ruby",
			category: "HTTP",
			description: "OpenAI-compatible call using Ruby Net::HTTP.",
			lang: "ruby",
			code: `require "net/http"
require "uri"

uri = URI("${endpointUrl}")
request = Net::HTTP::Post.new(uri)
request["Authorization"] = "Bearer #{ENV["AI_STATS_API_KEY"]}"
request["Content-Type"] = "application/json"
request.body = <<~JSON
${payloadJson}
JSON

response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") do |http|
  http.request(request)
end

puts response.body`,
		},
		{
			id: "openai-node",
			label: "TypeScript",
			category: "OpenAI SDK",
			description: "OpenAI JavaScript SDK pointed at AI Stats Gateway.",
			lang: "ts",
			installCommand: "npm install openai",
			code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AI_STATS_API_KEY,
  baseURL: "${BASE_URL}",
});

const response = await client.responses.create(
${payloadJsonNode}
);

console.log(response);`,
		},
		{
			id: "openai-javascript",
			label: "JavaScript",
			category: "OpenAI SDK",
			description: "OpenAI JavaScript SDK (CommonJS) for AI Stats Gateway.",
			lang: "js",
			installCommand: "npm install openai",
			code: `const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.AI_STATS_API_KEY,
  baseURL: "${BASE_URL}",
});

const response = await client.responses.create(
${payloadJsonNode}
);

console.log(response);`,
		},
		{
			id: "openai-python",
			label: "Python",
			category: "OpenAI SDK",
			description: "OpenAI Python SDK pointed at AI Stats Gateway.",
			lang: "python",
			installCommand: "pip install openai",
			code: `import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("AI_STATS_API_KEY"),
    base_url="${BASE_URL}",
)

payload = ${payloadJsonPython}
response = client.responses.create(**payload)

print(response)`,
		},
		{
			id: "openai-csharp",
			label: "C#",
			category: "OpenAI SDK",
			description: "OpenAI .NET SDK configured to use AI Stats Gateway.",
			lang: "csharp",
			installCommand: "dotnet add package OpenAI",
			code: `using OpenAI;
using OpenAI.Responses;

var apiKey = Environment.GetEnvironmentVariable("AI_STATS_API_KEY");
var client = new OpenAIClient(apiKey, new OpenAIClientOptions
{
    Endpoint = new Uri("${BASE_URL}")
});

var responseClient = client.GetResponseClient();
var result = await responseClient.CreateResponseAsync(new ResponseCreationOptions
{
    Model = "${modelId}",
    Input = ${resolvedPromptStringLiteral},
});

Console.WriteLine(result.Value.OutputText);`,
		},
		{
			id: "openai-go",
			label: "Go",
			category: "OpenAI SDK",
			description: "OpenAI Go SDK configured to use AI Stats Gateway.",
			lang: "go",
			installCommand: "go get github.com/openai/openai-go",
			code: `package main

import (
    "context"
    "fmt"
    "os"

    openai "github.com/openai/openai-go"
    "github.com/openai/openai-go/option"
)

func main() {
    client := openai.NewClient(
        option.WithAPIKey(os.Getenv("AI_STATS_API_KEY")),
        option.WithBaseURL("${BASE_URL}"),
    )

    response, err := client.Responses.New(context.Background(), openai.ResponseNewParams{
        Model: openai.String("${modelId}"),
        Input: openai.ResponseNewParamsInputUnion{
            OfString: openai.String(${resolvedPromptStringLiteral}),
        },
    })
    if err != nil {
        panic(err)
    }

    fmt.Println(response.OutputText())
}`,
		},
		{
			id: "openai-java",
			label: "Java",
			category: "OpenAI SDK",
			description: "OpenAI Java SDK configured for AI Stats Gateway.",
			lang: "java",
			installCommand: "./mvnw dependency:get -Dartifact=com.openai:openai-java:latest.release",
			code: `import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.models.responses.Response;
import com.openai.models.responses.ResponseCreateParams;

public class Main {
    public static void main(String[] args) {
        // Set env vars before running:
        // OPENAI_API_KEY=$AI_STATS_API_KEY
        // OPENAI_BASE_URL=${BASE_URL}
        OpenAIClient client = OpenAIOkHttpClient.fromEnv();

        ResponseCreateParams params = ResponseCreateParams.builder()
            .model("${modelId}")
            .input(${JSON.stringify(resolvedPrompt)})
            .build();

        Response response = client.responses().create(params);
        System.out.println(response);
    }
}`,
		},
		{
			id: "anthropic-node",
			label: "TypeScript",
			category: "Anthropic SDK",
			description: "Anthropic JavaScript SDK configured to use AI Stats Gateway.",
			lang: "ts",
			installCommand: "npm install @anthropic-ai/sdk",
			code: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.AI_STATS_API_KEY,
  baseURL: "${BASE_URL}",
});

const response = await client.messages.create({
  model: "${modelId}",
  max_tokens: 512,
  messages: [{ role: "user", content: ${JSON.stringify(resolvedPrompt)} }],
});

console.log(response);`,
		},
		{
			id: "anthropic-javascript",
			label: "JavaScript",
			category: "Anthropic SDK",
			description: "Anthropic JavaScript SDK (CommonJS) for AI Stats Gateway.",
			lang: "js",
			installCommand: "npm install @anthropic-ai/sdk",
			code: `const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.AI_STATS_API_KEY,
  baseURL: "${BASE_URL}",
});

const response = await client.messages.create({
  model: "${modelId}",
  max_tokens: 512,
  messages: [{ role: "user", content: ${JSON.stringify(resolvedPrompt)} }],
});

console.log(response);`,
		},
		{
			id: "anthropic-python",
			label: "Python",
			category: "Anthropic SDK",
			description: "Anthropic Python SDK configured to use AI Stats Gateway.",
			lang: "python",
			installCommand: "pip install anthropic",
			code: `import os
from anthropic import Anthropic

client = Anthropic(
    api_key=os.environ.get("AI_STATS_API_KEY"),
    base_url="${BASE_URL}",
)

response = client.messages.create(
    model="${modelId}",
    max_tokens=512,
    messages=[{"role": "user", "content": ${JSON.stringify(resolvedPrompt)}}],
)

print(response)`,
		},
		{
			id: "aistats-typescript",
			label: "TypeScript",
			category: "AI Stats SDK",
			description: "Official AI Stats SDK for TypeScript.",
			lang: "ts",
			installCommand: "npm install @ai-stats/sdk",
			code: `import { AIStats } from "@ai-stats/sdk";

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
});

const response = await client.generateResponse(
${payloadJsonNode}
);

console.log(response);`,
		},
		{
			id: "aistats-python",
			label: "Python",
			category: "AI Stats SDK",
			description: "Official AI Stats SDK for Python.",
			lang: "python",
			installCommand: "pip install ai-stats",
			code: `import os
from ai_stats import AIStats

client = AIStats(api_key=os.environ.get("AI_STATS_API_KEY"))

payload = ${payloadJsonPython}
response = client.generate_response(payload)

print(response)`,
		},
		{
			id: "aistats-go",
			label: "Go",
			category: "AI Stats SDK",
			description: "Official AI Stats SDK for Go.",
			lang: "go",
			installCommand:
				"go get github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go@latest",
			code: `package main

import (
    "context"
    "encoding/json"
    "fmt"
    aistats "github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go"
)

func main() {
    client, err := aistats.NewAIStatsFromEnv()
    if err != nil {
        panic(err)
    }

    payloadJSON := \`${payloadJson}\`
    var payload map[string]any
    if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
        panic(err)
    }

    response, err := client.Request(context.Background(), "POST", "${endpointPath}", nil, nil, payload)
    if err != nil {
        panic(err)
    }

    fmt.Println(response)
}`,
		},
		{
			id: "aistats-csharp",
			label: "C#",
			category: "AI Stats SDK",
			description: "Official AI Stats SDK for C#.",
			lang: "csharp",
			installCommand: "dotnet add package AI.Stats.Sdk",
			code: `using System.Collections.Generic;
using System.Text.Json;
using AiStatsSdk;

var client = new AIStats();
var payload = JsonSerializer.Deserialize<Dictionary<string, object>>("""
${payloadJson}
""");

var response = await client.RawClient.SendAsync<object>(
    method: "POST",
    path: "${endpointPath}",
    body: payload
);

Console.WriteLine(JsonSerializer.Serialize(response, new JsonSerializerOptions
{
    WriteIndented = true
}));`,
		},
		{
			id: "aistats-php",
			label: "PHP",
			category: "AI Stats SDK",
			description: "Official AI Stats SDK for PHP.",
			lang: "php",
			installCommand: "composer require ai-stats/php-sdk",
			code: `<?php
require "vendor/autoload.php";

use AIStats\\Sdk\\AIStats;

$client = new AIStats(apiKey: getenv("AI_STATS_API_KEY"));
$payload = json_decode(<<<'JSON'
${payloadJson}
JSON, true, 512, JSON_THROW_ON_ERROR);

$response = $client->rawClient()->request(
    "POST",
    "${endpointPath}",
    null,
    null,
    $payload
);

echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;`,
		},
		{
			id: "aistats-ruby",
			label: "Ruby",
			category: "AI Stats SDK",
			description: "Official AI Stats SDK for Ruby.",
			lang: "ruby",
			installCommand: "gem install ai_stats_sdk",
			code: `require "json"
require "ai_stats_sdk"

client = AIStatsSdk::AIStats.new
payload = JSON.parse(<<~JSON)
${payloadJson}
JSON

response = client.raw_client.request(
  method: "post",
  path: "${endpointPath}",
  body: payload
)

puts JSON.pretty_generate(response)`,
		},
	];
}

function getSnippetLogoId(snippet: PlaygroundCodeSnippet): string | null {
	switch (snippet.lang) {
		case "ts":
			return "typescript";
		case "js":
			return "javascript";
		case "python":
			return "python";
		case "go":
			return "go";
		case "csharp":
			return "csharp";
		case "java":
			return "java";
		case "php":
			return "php";
		case "ruby":
			return "ruby";
		case "rust":
			return "rust";
		default:
			return null;
	}
}

export default function ModelPlayground({
	modelId,
	requestModelId,
	modelName,
	gatewayModels = [],
}: ModelPlaygroundProps) {
	const [mode, setMode] = useState<PlaygroundMode>("text");
	const [prompt, setPrompt] = useState("");
	const [responseText, setResponseText] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [stats, setStats] = useState<PlaygroundStats | null>(null);
	const [elapsedMs, setElapsedMs] = useState(0);
	const startRef = useRef<number | null>(null);
	const [audioPrompt, setAudioPrompt] = useState("");
	const [audioResponseUrl, setAudioResponseUrl] = useState<string | null>(null);
	const [audioResponseText, setAudioResponseText] = useState("");
	const [audioIsGenerating, setAudioIsGenerating] = useState(false);
	const [audioError, setAudioError] = useState<string | null>(null);
	const [audioStats, setAudioStats] = useState<PlaygroundStats | null>(null);
	const [audioElapsedMs, setAudioElapsedMs] = useState(0);
	const audioStartRef = useRef<number | null>(null);
	const [imagePrompt, setImagePrompt] = useState("");
	const [imageResponseUrls, setImageResponseUrls] = useState<string[]>([]);
	const [imageResponseText, setImageResponseText] = useState("");
	const [imageIsGenerating, setImageIsGenerating] = useState(false);
	const [imageError, setImageError] = useState<string | null>(null);
	const [videoPrompt, setVideoPrompt] = useState("");
	const [videoResponseUrls, setVideoResponseUrls] = useState<string[]>([]);
	const [videoResponseText, setVideoResponseText] = useState("");
	const [videoIsGenerating, setVideoIsGenerating] = useState(false);
	const [videoError, setVideoError] = useState<string | null>(null);
	const [embeddingsPrompt, setEmbeddingsPrompt] = useState("");
	const [embeddingsVectors, setEmbeddingsVectors] = useState<number[][]>([]);
	const [embeddingsRawResponse, setEmbeddingsRawResponse] = useState("");
	const [embeddingsIsGenerating, setEmbeddingsIsGenerating] = useState(false);
	const [embeddingsError, setEmbeddingsError] = useState<string | null>(null);
	const [moderationPrompt, setModerationPrompt] = useState("");
	const [moderationResult, setModerationResult] =
		useState<NormalizedModerationResult | null>(null);
	const [moderationRawResponse, setModerationRawResponse] = useState("");
	const [moderationIsGenerating, setModerationIsGenerating] = useState(false);
	const [moderationError, setModerationError] = useState<string | null>(null);
	const [isCodeDialogOpen, setIsCodeDialogOpen] = useState(false);
	const [selectedCodeCategory, setSelectedCodeCategory] =
		useState<PlaygroundCodeSnippet["category"]>("AI Stats SDK");
	const [selectedCodeSnippetId, setSelectedCodeSnippetId] = useState(
		"aistats-typescript",
	);

	const trimmedPrompt = prompt.trim();
	const hasPrompt = trimmedPrompt.length > 0;
	const resolvedRequestModelId = (requestModelId ?? "").trim() || modelId;
	const chatHref = useMemo(
		() => {
			const modelPart = `model=${encodeURIComponent(resolvedRequestModelId)}`;
			if (!trimmedPrompt) return `/chat?${modelPart}`;
			return `/chat?${modelPart}&prompt=${encodeURIComponent(trimmedPrompt)}`;
		},
		[resolvedRequestModelId, trimmedPrompt],
	);
	const codeSnippets = useMemo(
		() =>
			buildPlaygroundCodeSnippets({
				modelId: resolvedRequestModelId,
				modelName,
				prompt: trimmedPrompt,
			}),
		[modelName, resolvedRequestModelId, trimmedPrompt],
	);
	const codeCategories = useMemo(
		() => {
			const categoriesInSnippets = new Set(
				codeSnippets.map((snippet) => snippet.category),
			);
			return CODE_CATEGORY_ORDER.filter((category) =>
				categoriesInSnippets.has(category),
			);
		},
		[codeSnippets],
	);
	const snippetsForSelectedCategory = useMemo(
		() =>
			codeSnippets.filter((snippet) => snippet.category === selectedCodeCategory),
		[codeSnippets, selectedCodeCategory],
	);
	const selectedCodeSnippet = useMemo(
		() =>
			codeSnippets.find((snippet) => snippet.id === selectedCodeSnippetId) ?? null,
		[codeSnippets, selectedCodeSnippetId],
	);
	const trimmedAudioPrompt = audioPrompt.trim();
	const hasAudioPrompt = trimmedAudioPrompt.length > 0;
	const trimmedImagePrompt = imagePrompt.trim();
	const hasImagePrompt = trimmedImagePrompt.length > 0;
	const trimmedVideoPrompt = videoPrompt.trim();
	const hasVideoPrompt = trimmedVideoPrompt.length > 0;
	const trimmedEmbeddingsPrompt = embeddingsPrompt.trim();
	const hasEmbeddingsPrompt = trimmedEmbeddingsPrompt.length > 0;
	const trimmedModerationPrompt = moderationPrompt.trim();
	const hasModerationPrompt = trimmedModerationPrompt.length > 0;
	const modelsByMode = useMemo(() => {
		const byMode: Record<PlaygroundMode, GatewaySupportedModel[]> = {
			text: [],
			audio: [],
			image: [],
			video: [],
			embeddings: [],
			moderation: [],
		};
		byMode.text = filterModelsForRoom(gatewayModels, "text");
		byMode.audio = filterModelsForRoom(gatewayModels, "audio");
		byMode.image = filterModelsForRoom(gatewayModels, "image");
		byMode.video = filterModelsForRoom(gatewayModels, "video");
		byMode.embeddings = filterModelsForRoom(gatewayModels, "embeddings");
		byMode.moderation = filterModelsForRoom(gatewayModels, "moderation");
		return byMode;
	}, [gatewayModels]);
	const hasModeSupport = useMemo(() => {
		const support: Record<PlaygroundMode, boolean> = {
			text: modelsByMode.text.length > 0,
			audio: modelsByMode.audio.length > 0,
			image: modelsByMode.image.length > 0,
			video: modelsByMode.video.length > 0,
			embeddings: modelsByMode.embeddings.length > 0,
			moderation: modelsByMode.moderation.length > 0,
		};
		return support;
	}, [modelsByMode]);
	const availableModeConfigs = useMemo(
		() => MODE_CONFIGS.filter((config) => hasModeSupport[config.mode]),
		[hasModeSupport],
	);
	const resolvedAudioModelId = useMemo(() => {
		return resolveSupportedModelId(modelsByMode.audio, resolvedRequestModelId);
	}, [modelsByMode.audio, resolvedRequestModelId]);
	const resolvedImageModelId = useMemo(
		() => resolveSupportedModelId(modelsByMode.image, resolvedRequestModelId),
		[modelsByMode.image, resolvedRequestModelId],
	);
	const resolvedVideoModelId = useMemo(
		() => resolveSupportedModelId(modelsByMode.video, resolvedRequestModelId),
		[modelsByMode.video, resolvedRequestModelId],
	);
	const resolvedEmbeddingsModelId = useMemo(
		() => resolveSupportedModelId(modelsByMode.embeddings, resolvedRequestModelId),
		[modelsByMode.embeddings, resolvedRequestModelId],
	);
	const resolvedModerationModelId = useMemo(
		() => resolveSupportedModelId(modelsByMode.moderation, resolvedRequestModelId),
		[modelsByMode.moderation, resolvedRequestModelId],
	);

	useEffect(() => {
		if (!isGenerating || startRef.current == null) return;
		const timer = window.setInterval(() => {
			if (startRef.current == null) return;
			setElapsedMs(Math.max(0, performance.now() - startRef.current));
		}, 100);
		return () => window.clearInterval(timer);
	}, [isGenerating]);
	useEffect(() => {
		if (!audioIsGenerating || audioStartRef.current == null) return;
		const timer = window.setInterval(() => {
			if (audioStartRef.current == null) return;
			setAudioElapsedMs(Math.max(0, performance.now() - audioStartRef.current));
		}, 100);
		return () => window.clearInterval(timer);
	}, [audioIsGenerating]);
	useEffect(() => {
		if (hasModeSupport[mode]) return;
		const fallbackMode = availableModeConfigs[0]?.mode ?? null;
		if (fallbackMode) {
			setMode(fallbackMode);
		}
	}, [availableModeConfigs, hasModeSupport, mode]);
	useEffect(() => {
		return () => {
			if (audioResponseUrl && audioResponseUrl.startsWith("blob:")) {
				URL.revokeObjectURL(audioResponseUrl);
			}
		};
	}, [audioResponseUrl]);
	useEffect(() => {
		if (!codeCategories.length) return;
		if (!codeCategories.includes(selectedCodeCategory)) {
			setSelectedCodeCategory(codeCategories[0]);
		}
	}, [codeCategories, selectedCodeCategory]);
	useEffect(() => {
		if (!codeSnippets.length || !selectedCodeCategory) return;
		if (
			selectedCodeSnippet &&
			selectedCodeSnippet.category === selectedCodeCategory
		) {
			return;
		}
		const fallbackSnippet = codeSnippets.find(
			(snippet) => snippet.category === selectedCodeCategory,
		);
		if (fallbackSnippet) {
			setSelectedCodeSnippetId(fallbackSnippet.id);
			return;
		}
		setSelectedCodeSnippetId(codeSnippets[0]?.id ?? "raw-curl");
	}, [codeSnippets, selectedCodeCategory, selectedCodeSnippet]);
	const handleSelectCodeCategory = (
		category: PlaygroundCodeSnippet["category"],
	): void => {
		setSelectedCodeCategory(category);
		const firstInCategory = codeSnippets.find(
			(snippet) => snippet.category === category,
		);
		if (firstInCategory) {
			setSelectedCodeSnippetId(firstInCategory.id);
		}
	};

	const handleGenerate = async () => {
		if (!trimmedPrompt || isGenerating) return;

		setIsGenerating(true);
		setError(null);
		setStats(null);
		setResponseText("");
		startRef.current = performance.now();
		setElapsedMs(0);

		let finalUsage: Record<string, unknown> | null = null;
		let finalMeta: Record<string, unknown> | null = null;
		let streamingText = "";

		try {
			const response = await fetch("/api/chat/playground", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					requestBody: {
						model: resolvedRequestModelId,
						stream: true,
						input: [{ role: "user", content: trimmedPrompt }],
					},
					appHeaders: PLAYGROUND_APP_HEADERS,
				}),
			});

			if (!response.ok) {
				throw new Error(await readErrorMessage(response));
			}

			const contentType = response.headers.get("content-type") ?? "";
			if (response.body && contentType.includes("text/event-stream")) {
				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const frames = buffer.split(/\r?\n\r?\n/);
					buffer = frames.pop() ?? "";

					for (const frame of frames) {
						const { eventType, data } = parseSseFrame(frame);
						if (!data || data === "[DONE]") continue;
						try {
							const parsed = JSON.parse(data);
							finalUsage = extractUsage(parsed) ?? finalUsage;
							finalMeta = extractMeta(parsed) ?? finalMeta;

							const frameType =
								typeof parsed?.type === "string" ? parsed.type : eventType;
							if (
								frameType === "response.output_text.delta" &&
								typeof parsed?.delta === "string"
							) {
								streamingText += parsed.delta;
								setResponseText(streamingText);
								continue;
							}
							if (
								frameType === "response.output_text.done" &&
								typeof parsed?.text === "string"
							) {
								streamingText = parsed.text;
								setResponseText(streamingText);
								continue;
							}
							if (frameType === "response.completed") {
								const completedPayload = parsed?.response ?? parsed;
								finalUsage = extractUsage(completedPayload) ?? finalUsage;
								finalMeta = extractMeta(completedPayload) ?? finalMeta;
								const finalText = extractResponseText(
									completedPayload,
								).trim();
								if (finalText) {
									streamingText = finalText;
									setResponseText(streamingText);
								}
								continue;
							}

							const fallbackDelta =
								typeof parsed?.delta === "string"
									? parsed.delta
									: typeof parsed?.text === "string"
										? parsed.text
										: "";
							if (fallbackDelta) {
								streamingText += fallbackDelta;
								setResponseText(streamingText);
							}
						} catch {
							// ignore malformed chunks
						}
					}
				}
			} else {
				const payload = contentType.includes("application/json")
					? await response.json()
					: { output_text: await response.text() };
				finalUsage = extractUsage(payload);
				finalMeta = extractMeta(payload);
				const nextResponse = extractResponseText(payload).trim();
				if (nextResponse) {
					streamingText = nextResponse;
					setResponseText(nextResponse);
				}
			}

			const endAt = performance.now();
			const totalElapsedMs =
				startRef.current == null
					? 0
					: Math.max(0, endAt - startRef.current);
			setElapsedMs(totalElapsedMs);
			const totalTokens = extractTotalTokens(finalUsage);
			const totalCostUsd = extractTotalCostUsd(finalUsage);
			const throughputTokensPerSecond = extractThroughputTokensPerSecond(
				finalMeta,
				totalTokens,
				totalElapsedMs,
			);
			setStats({
				elapsedMs: totalElapsedMs,
				totalTokens,
				throughputTokensPerSecond,
				totalCostUsd,
			});
			if (!streamingText.trim()) {
				setResponseText("Request completed.");
			}
		} catch (requestError) {
			const message =
				requestError instanceof Error
					? requestError.message
					: "Request failed. Please try again.";
			setError(message);
		} finally {
			setIsGenerating(false);
			startRef.current = null;
		}
	};
	const handleGenerateAudio = async () => {
		if (!trimmedAudioPrompt || audioIsGenerating || !resolvedAudioModelId) return;

		setAudioIsGenerating(true);
		setAudioError(null);
		setAudioStats(null);
		setAudioResponseText("");
		if (audioResponseUrl?.startsWith("blob:")) {
			URL.revokeObjectURL(audioResponseUrl);
		}
		setAudioResponseUrl(null);
		audioStartRef.current = performance.now();
		setAudioElapsedMs(0);

		try {
			const audioDefaults = getDefaultAudioRoomParams(resolvedAudioModelId);
			const audioOptions = buildAudioRequestOptions(
				"speech",
				resolvedAudioModelId,
				audioDefaults,
			);
			const response = await fetch("/api/chat/audio", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					action: "speech",
					requestBody: {
						model: resolvedAudioModelId,
						input: trimmedAudioPrompt,
						...audioOptions,
					},
					appHeaders: PLAYGROUND_APP_HEADERS,
				}),
			});
			if (!response.ok) {
				throw new Error(await readErrorMessage(response));
			}

			const contentType = response.headers.get("content-type") ?? "";
			let usage: Record<string, unknown> | null = null;
			let meta: Record<string, unknown> | null = null;
			let nextAudioUrl: string | null = null;
			let nextAudioText = "";
			if (contentType.includes("application/json")) {
				const payload = await response.json();
				usage = extractUsage(payload);
				meta = extractMeta(payload);
				const maybeAudioUrl = extractAudioDataUrl(payload);
				if (maybeAudioUrl) nextAudioUrl = maybeAudioUrl;
				const maybeText = extractResponseText(payload).trim();
				if (maybeText) nextAudioText = maybeText;
			} else if (contentType.startsWith("audio/") && response.body) {
				const blob = await response.blob();
				nextAudioUrl = URL.createObjectURL(blob);
			} else if (contentType.startsWith("text/")) {
				const text = (await response.text()).trim();
				if (text) nextAudioText = text;
			} else {
				const blob = await response.blob();
				const normalizedBlob =
					blob.type && blob.type !== "application/octet-stream"
						? blob
						: new Blob([blob], { type: "audio/mpeg" });
				nextAudioUrl = URL.createObjectURL(normalizedBlob);
			}
			if (!nextAudioUrl && !nextAudioText) {
				nextAudioText = "Audio request completed.";
			}
			setAudioResponseUrl(nextAudioUrl);
			setAudioResponseText(nextAudioText);

			const endAt = performance.now();
			const totalElapsedMs =
				audioStartRef.current == null
					? 0
					: Math.max(0, endAt - audioStartRef.current);
			setAudioElapsedMs(totalElapsedMs);
			const totalTokens = extractTotalTokens(usage);
			const totalCostUsd = extractTotalCostUsd(usage);
			const throughputTokensPerSecond = extractThroughputTokensPerSecond(
				meta,
				totalTokens,
				totalElapsedMs,
			);
			setAudioStats({
				elapsedMs: totalElapsedMs,
				totalTokens,
				throughputTokensPerSecond,
				totalCostUsd,
			});
		} catch (requestError) {
			const message =
				requestError instanceof Error
					? requestError.message
					: "Audio request failed. Please try again.";
			setAudioError(message);
		} finally {
			setAudioIsGenerating(false);
			audioStartRef.current = null;
		}
	};

	const handleGenerateImage = async () => {
		if (!trimmedImagePrompt || imageIsGenerating || !resolvedImageModelId) return;

		setImageIsGenerating(true);
		setImageError(null);
		setImageResponseUrls([]);
		setImageResponseText("");

		try {
			const imageDefaults = getDefaultImageRoomParams(resolvedImageModelId);
			const imageOptions = buildImageRequestOptions(
				resolvedImageModelId,
				imageDefaults,
			);
			const response = await fetch("/api/chat/image", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					requestBody: {
						model: resolvedImageModelId,
						prompt: trimmedImagePrompt,
						...imageOptions,
					},
					appHeaders: PLAYGROUND_APP_HEADERS,
				}),
			});
			if (!response.ok) {
				throw new Error(await readErrorMessage(response));
			}

			const contentType = response.headers.get("content-type") ?? "";
			const payload = contentType.includes("application/json")
				? await response.json()
				: { output_text: await response.text() };
			const urls = extractGenerationUrls(payload);
			const text = extractResponseText(payload).trim();
			setImageResponseUrls(urls);
			setImageResponseText(
				text ||
					(urls.length ? "" : JSON.stringify(payload, null, 2) || "Image request completed."),
			);
		} catch (requestError) {
			const message =
				requestError instanceof Error
					? requestError.message
					: "Image request failed. Please try again.";
			setImageError(message);
		} finally {
			setImageIsGenerating(false);
		}
	};

	const handleGenerateVideo = async () => {
		if (!trimmedVideoPrompt || videoIsGenerating || !resolvedVideoModelId) return;

		setVideoIsGenerating(true);
		setVideoError(null);
		setVideoResponseUrls([]);
		setVideoResponseText("");

		try {
			const videoDefaults = getDefaultVideoRoomParams(resolvedVideoModelId);
			const videoOptions = buildVideoRequestOptions(
				resolvedVideoModelId,
				videoDefaults,
			);
			const response = await fetch("/api/chat/video", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					requestBody: {
						model: resolvedVideoModelId,
						prompt: trimmedVideoPrompt,
						...videoOptions,
					},
					appHeaders: PLAYGROUND_APP_HEADERS,
				}),
			});
			if (!response.ok) {
				throw new Error(await readErrorMessage(response));
			}

			const contentType = response.headers.get("content-type") ?? "";
			const payload = contentType.includes("application/json")
				? await response.json()
				: { output_text: await response.text() };
			const urls = extractGenerationUrls(payload);
			const text = extractResponseText(payload).trim();
			setVideoResponseUrls(urls);
			setVideoResponseText(
				text ||
					(urls.length ? "" : JSON.stringify(payload, null, 2) || "Video request completed."),
			);
		} catch (requestError) {
			const message =
				requestError instanceof Error
					? requestError.message
					: "Video request failed. Please try again.";
			setVideoError(message);
		} finally {
			setVideoIsGenerating(false);
		}
	};

	const handleGenerateEmbeddings = async () => {
		if (
			!trimmedEmbeddingsPrompt ||
			embeddingsIsGenerating ||
			!resolvedEmbeddingsModelId
		) {
			return;
		}

		setEmbeddingsIsGenerating(true);
		setEmbeddingsError(null);
		setEmbeddingsVectors([]);
		setEmbeddingsRawResponse("");

		try {
			const embeddingDefaults = getDefaultEmbeddingsRoomParams();
			const embeddingOptions = buildEmbeddingsRequestOptions(
				resolvedEmbeddingsModelId,
				embeddingDefaults,
			);
			const response = await fetch("/api/chat/embeddings", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					requestBody: {
						model: resolvedEmbeddingsModelId,
						input: trimmedEmbeddingsPrompt,
						meta: true,
						...embeddingOptions,
					},
					appHeaders: PLAYGROUND_APP_HEADERS,
				}),
			});
			if (!response.ok) {
				throw new Error(await readErrorMessage(response));
			}

			const payload = await response.json();
			setEmbeddingsVectors(extractEmbeddingVectors(payload));
			setEmbeddingsRawResponse(JSON.stringify(payload, null, 2));
		} catch (requestError) {
			const message =
				requestError instanceof Error
					? requestError.message
					: "Embeddings request failed. Please try again.";
			setEmbeddingsError(message);
		} finally {
			setEmbeddingsIsGenerating(false);
		}
	};

	const handleGenerateModeration = async () => {
		if (
			!trimmedModerationPrompt ||
			moderationIsGenerating ||
			!resolvedModerationModelId
		) {
			return;
		}

		setModerationIsGenerating(true);
		setModerationError(null);
		setModerationResult(null);
		setModerationRawResponse("");

		try {
			const response = await fetch("/api/chat/moderation", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					requestBody: {
						model: resolvedModerationModelId,
						input: buildModerationInput({ text: trimmedModerationPrompt }),
						meta: true,
					},
					appHeaders: PLAYGROUND_APP_HEADERS,
				}),
			});
			if (!response.ok) {
				throw new Error(await readErrorMessage(response));
			}

			const payload = await response.json();
			setModerationResult(normalizeModerationResult(payload));
			setModerationRawResponse(JSON.stringify(payload, null, 2));
		} catch (requestError) {
			const message =
				requestError instanceof Error
					? requestError.message
					: "Moderation request failed. Please try again.";
			setModerationError(message);
		} finally {
			setModerationIsGenerating(false);
		}
	};

	const showEmptyResponse = !isGenerating && !responseText && !error;
	const showThinkingState = isGenerating && !responseText;
	const showEmptyAudioResponse =
		!audioIsGenerating && !audioResponseUrl && !audioResponseText && !audioError;
	const showAudioThinkingState = audioIsGenerating && !audioResponseUrl && !audioResponseText;
	const showImageThinkingState =
		imageIsGenerating && !imageResponseUrls.length && !imageResponseText;
	const showEmptyImageResponse =
		!imageIsGenerating &&
		!imageResponseUrls.length &&
		!imageResponseText &&
		!imageError;
	const showVideoThinkingState =
		videoIsGenerating && !videoResponseUrls.length && !videoResponseText;
	const showEmptyVideoResponse =
		!videoIsGenerating &&
		!videoResponseUrls.length &&
		!videoResponseText &&
		!videoError;
	const showEmbeddingsThinkingState =
		embeddingsIsGenerating &&
		!embeddingsVectors.length &&
		!embeddingsRawResponse;
	const showEmptyEmbeddingsResponse =
		!embeddingsIsGenerating &&
		!embeddingsVectors.length &&
		!embeddingsRawResponse &&
		!embeddingsError;
	const showModerationThinkingState =
		moderationIsGenerating && !moderationResult && !moderationRawResponse;
	const showEmptyModerationResponse =
		!moderationIsGenerating &&
		!moderationResult &&
		!moderationRawResponse &&
		!moderationError;
	const embeddingsFirstVector = embeddingsVectors[0] ?? null;
	const handleEnterToSubmit = (
		event: React.KeyboardEvent<HTMLTextAreaElement>,
		onSubmit: () => void,
	) => {
		if (event.key !== "Enter") return;
		if (event.shiftKey) return;
		if (event.nativeEvent.isComposing) return;
		event.preventDefault();
		onSubmit();
	};
	const handlePromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		handleEnterToSubmit(event, () => void handleGenerate());
	};
	const handleAudioPromptKeyDown = (
		event: React.KeyboardEvent<HTMLTextAreaElement>,
	) => {
		handleEnterToSubmit(event, () => void handleGenerateAudio());
	};
	const handleImagePromptKeyDown = (
		event: React.KeyboardEvent<HTMLTextAreaElement>,
	) => {
		handleEnterToSubmit(event, () => void handleGenerateImage());
	};
	const handleVideoPromptKeyDown = (
		event: React.KeyboardEvent<HTMLTextAreaElement>,
	) => {
		handleEnterToSubmit(event, () => void handleGenerateVideo());
	};
	const handleEmbeddingsPromptKeyDown = (
		event: React.KeyboardEvent<HTMLTextAreaElement>,
	) => {
		handleEnterToSubmit(event, () => void handleGenerateEmbeddings());
	};
	const handleModerationPromptKeyDown = (
		event: React.KeyboardEvent<HTMLTextAreaElement>,
	) => {
		handleEnterToSubmit(event, () => void handleGenerateModeration());
	};

	const renderThinkingPanel = () => (
		<div className="flex h-full flex-col items-center justify-center gap-3 text-black/55 dark:text-white/65">
			<TerminalSquare className="h-10 w-10" />
			<div className="flex items-end gap-1.5">
				<span
					className="h-2.5 w-2.5 animate-bounce rounded-full bg-current"
					style={{ animationDelay: "0ms" }}
				/>
				<span
					className="h-2.5 w-2.5 animate-bounce rounded-full bg-current"
					style={{ animationDelay: "140ms" }}
				/>
				<span
					className="h-2.5 w-2.5 animate-bounce rounded-full bg-current"
					style={{ animationDelay: "280ms" }}
				/>
			</div>
		</div>
	);
	const renderEmptyPanel = (label: string) => (
		<div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-black/55 dark:text-white/60">
			<TerminalSquare className="h-10 w-10" />
			<p>{label}</p>
		</div>
	);

	const renderModeIcon = (targetMode: PlaygroundMode) => {
		switch (targetMode) {
			case "text":
				return <FileText className="h-4 w-4" />;
			case "audio":
				return <Mic className="h-4 w-4" />;
			case "image":
				return <ImageIcon className="h-4 w-4" />;
			case "video":
				return <Clapperboard className="h-4 w-4" />;
			case "embeddings":
				return <Fingerprint className="h-4 w-4" />;
			case "moderation":
				return <ShieldAlert className="h-4 w-4" />;
		}
	};

	const renderInlineRoom = () => {
		if (!hasModeSupport[mode]) {
			return (
				<div className="rounded-xl border border-black/15 bg-black/[0.02] p-6 dark:border-white/20 dark:bg-white/[0.03]">
					<div className="space-y-2">
						<h3 className="text-base font-semibold">No Compatible Endpoint</h3>
						<p className="text-sm text-black/70 dark:text-white/70">
							No active {mode} endpoint is currently available for this model.
						</p>
					</div>
				</div>
			);
		}

		if (mode === "audio") {
			return (
				<div className="grid gap-6 md:grid-cols-2">
					<div className="flex min-h-[440px] flex-col gap-3">
						<Textarea
							value={audioPrompt}
							onChange={(event) => setAudioPrompt(event.target.value)}
							onKeyDown={handleAudioPromptKeyDown}
							placeholder="Enter text to convert to speech..."
							className="min-h-[320px] resize-none border-black/20 bg-white text-base text-black placeholder:text-black/45 focus-visible:ring-black/40 dark:border-white/25 dark:bg-black dark:text-white dark:placeholder:text-white/50 dark:focus-visible:ring-white/40"
						/>
						<Button
							type="button"
							onClick={handleGenerateAudio}
							disabled={!hasAudioPrompt || audioIsGenerating || !resolvedAudioModelId}
							className="h-11 w-full bg-black text-white hover:bg-zinc-800 disabled:bg-zinc-500 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
						>
							<Sparkles className="h-4 w-4" />
							{audioIsGenerating ? "Generating..." : "Generate Audio"}
						</Button>
						{audioError ? (
							<p className="rounded-md border border-black/20 bg-black/5 px-3 py-2 text-sm text-black dark:border-white/20 dark:bg-white/10 dark:text-white">
								{audioError}
							</p>
						) : null}
					</div>

					<div className="min-h-[440px] border-black/15 md:border-l md:pl-6 dark:border-white/20">
						{audioResponseUrl ? (
							<div className="space-y-4">
								<audio
									controls
									src={audioResponseUrl}
									className="w-full rounded-md border border-black/20 bg-white p-2 dark:border-white/20 dark:bg-black"
								/>
								{audioResponseText ? (
									<div className="text-sm leading-6 text-black dark:text-white">
										<Streamdown>{audioResponseText}</Streamdown>
									</div>
								) : null}
							</div>
						) : audioResponseText ? (
							<div className="text-sm leading-6 text-black dark:text-white">
								<Streamdown>{audioResponseText}</Streamdown>
							</div>
						) : showAudioThinkingState ? (
							renderThinkingPanel()
						) : showEmptyAudioResponse ? (
							renderEmptyPanel("Audio output appears here.")
						) : null}
					</div>
				</div>
			);
		}

		if (mode === "image") {
			return (
				<div className="grid gap-6 md:grid-cols-2">
					<div className="flex min-h-[440px] flex-col gap-3">
						<Textarea
							value={imagePrompt}
							onChange={(event) => setImagePrompt(event.target.value)}
							onKeyDown={handleImagePromptKeyDown}
							placeholder="Describe the image you want to generate..."
							className="min-h-[320px] resize-none border-black/20 bg-white text-base text-black placeholder:text-black/45 focus-visible:ring-black/40 dark:border-white/25 dark:bg-black dark:text-white dark:placeholder:text-white/50 dark:focus-visible:ring-white/40"
						/>
						<Button
							type="button"
							onClick={handleGenerateImage}
							disabled={!hasImagePrompt || imageIsGenerating || !resolvedImageModelId}
							className="h-11 w-full bg-black text-white hover:bg-zinc-800 disabled:bg-zinc-500 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
						>
							<Sparkles className="h-4 w-4" />
							{imageIsGenerating ? "Generating..." : "Generate Image"}
						</Button>
						{imageError ? (
							<p className="rounded-md border border-black/20 bg-black/5 px-3 py-2 text-sm text-black dark:border-white/20 dark:bg-white/10 dark:text-white">
								{imageError}
							</p>
						) : null}
					</div>

					<div className="min-h-[440px] border-black/15 md:border-l md:pl-6 dark:border-white/20">
						{imageResponseUrls.length ? (
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								{imageResponseUrls.map((url, index) => (
									<a
										key={`${url}-${index}`}
										href={url}
										target="_blank"
										rel="noreferrer"
										className="block overflow-hidden rounded-md border border-black/20 dark:border-white/20"
									>
										<img
											src={url}
											alt={`Generated image ${index + 1}`}
											className="h-full w-full object-cover"
										/>
									</a>
								))}
							</div>
						) : imageResponseText ? (
							<div className="text-sm leading-6 text-black dark:text-white">
								<Streamdown>{imageResponseText}</Streamdown>
							</div>
						) : showImageThinkingState ? (
							renderThinkingPanel()
						) : showEmptyImageResponse ? (
							renderEmptyPanel("Generated images appear here.")
						) : null}
					</div>
				</div>
			);
		}

		if (mode === "video") {
			return (
				<div className="grid gap-6 md:grid-cols-2">
					<div className="flex min-h-[440px] flex-col gap-3">
						<Textarea
							value={videoPrompt}
							onChange={(event) => setVideoPrompt(event.target.value)}
							onKeyDown={handleVideoPromptKeyDown}
							placeholder="Describe the video you want to generate..."
							className="min-h-[320px] resize-none border-black/20 bg-white text-base text-black placeholder:text-black/45 focus-visible:ring-black/40 dark:border-white/25 dark:bg-black dark:text-white dark:placeholder:text-white/50 dark:focus-visible:ring-white/40"
						/>
						<Button
							type="button"
							onClick={handleGenerateVideo}
							disabled={!hasVideoPrompt || videoIsGenerating || !resolvedVideoModelId}
							className="h-11 w-full bg-black text-white hover:bg-zinc-800 disabled:bg-zinc-500 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
						>
							<Sparkles className="h-4 w-4" />
							{videoIsGenerating ? "Generating..." : "Generate Video"}
						</Button>
						{videoError ? (
							<p className="rounded-md border border-black/20 bg-black/5 px-3 py-2 text-sm text-black dark:border-white/20 dark:bg-white/10 dark:text-white">
								{videoError}
							</p>
						) : null}
					</div>

					<div className="min-h-[440px] border-black/15 md:border-l md:pl-6 dark:border-white/20">
						{videoResponseUrls.length ? (
							<div className="space-y-4">
								{videoResponseUrls.map((url, index) => (
									<div key={`${url}-${index}`} className="space-y-2">
										<video
											controls
											src={url}
											className="w-full rounded-md border border-black/20 dark:border-white/20"
										/>
										<a
											href={url}
											target="_blank"
											rel="noreferrer"
											className="text-xs text-black/70 underline dark:text-white/70"
										>
											Open video {index + 1}
										</a>
									</div>
								))}
							</div>
						) : videoResponseText ? (
							<div className="text-sm leading-6 text-black dark:text-white">
								<Streamdown>{videoResponseText}</Streamdown>
							</div>
						) : showVideoThinkingState ? (
							renderThinkingPanel()
						) : showEmptyVideoResponse ? (
							renderEmptyPanel("Generated videos appear here.")
						) : null}
					</div>
				</div>
			);
		}

		if (mode === "embeddings") {
			return (
				<div className="grid gap-6 md:grid-cols-2">
					<div className="flex min-h-[440px] flex-col gap-3">
						<Textarea
							value={embeddingsPrompt}
							onChange={(event) => setEmbeddingsPrompt(event.target.value)}
							onKeyDown={handleEmbeddingsPromptKeyDown}
							placeholder="Enter text to embed..."
							className="min-h-[320px] resize-none border-black/20 bg-white text-base text-black placeholder:text-black/45 focus-visible:ring-black/40 dark:border-white/25 dark:bg-black dark:text-white dark:placeholder:text-white/50 dark:focus-visible:ring-white/40"
						/>
						<Button
							type="button"
							onClick={handleGenerateEmbeddings}
							disabled={
								!hasEmbeddingsPrompt ||
								embeddingsIsGenerating ||
								!resolvedEmbeddingsModelId
							}
							className="h-11 w-full bg-black text-white hover:bg-zinc-800 disabled:bg-zinc-500 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
						>
							<Sparkles className="h-4 w-4" />
							{embeddingsIsGenerating ? "Generating..." : "Generate Embeddings"}
						</Button>
						{embeddingsError ? (
							<p className="rounded-md border border-black/20 bg-black/5 px-3 py-2 text-sm text-black dark:border-white/20 dark:bg-white/10 dark:text-white">
								{embeddingsError}
							</p>
						) : null}
					</div>

					<div className="min-h-[440px] space-y-4 border-black/15 md:border-l md:pl-6 dark:border-white/20">
						{embeddingsVectors.length ? (
							<div className="space-y-2 rounded-md border border-black/15 bg-black/[0.02] p-3 text-sm dark:border-white/20 dark:bg-white/[0.03]">
								<p>
									<span className="font-medium">Vectors:</span>{" "}
									{embeddingsVectors.length.toLocaleString()}
								</p>
								<p>
									<span className="font-medium">Dimensions:</span>{" "}
									{(embeddingsFirstVector?.length ?? 0).toLocaleString()}
								</p>
								{embeddingsFirstVector ? (
									<p className="font-mono text-xs text-black/70 dark:text-white/70">
										{embeddingsFirstVector
											.slice(0, 8)
											.map((value) => value.toFixed(6))
											.join(", ")}
										{embeddingsFirstVector.length > 8 ? ", ..." : ""}
									</p>
								) : null}
							</div>
						) : null}
						{embeddingsRawResponse ? (
							<pre className="max-h-[320px] overflow-auto rounded-md border border-black/15 bg-black/[0.02] p-3 text-xs text-black dark:border-white/20 dark:bg-white/[0.03] dark:text-white">
								{embeddingsRawResponse}
							</pre>
						) : showEmbeddingsThinkingState ? (
							renderThinkingPanel()
						) : showEmptyEmbeddingsResponse ? (
							renderEmptyPanel("Embedding output appears here.")
						) : null}
					</div>
				</div>
			);
		}

		if (mode === "moderation") {
			const flaggedCategories = moderationResult
				? Object.entries(moderationResult.categories)
						.filter(([, value]) => value)
						.map(([key]) => key)
				: [];
			return (
				<div className="grid gap-6 md:grid-cols-2">
					<div className="flex min-h-[440px] flex-col gap-3">
						<Textarea
							value={moderationPrompt}
							onChange={(event) => setModerationPrompt(event.target.value)}
							onKeyDown={handleModerationPromptKeyDown}
							placeholder="Enter text to moderate..."
							className="min-h-[320px] resize-none border-black/20 bg-white text-base text-black placeholder:text-black/45 focus-visible:ring-black/40 dark:border-white/25 dark:bg-black dark:text-white dark:placeholder:text-white/50 dark:focus-visible:ring-white/40"
						/>
						<Button
							type="button"
							onClick={handleGenerateModeration}
							disabled={
								!hasModerationPrompt ||
								moderationIsGenerating ||
								!resolvedModerationModelId
							}
							className="h-11 w-full bg-black text-white hover:bg-zinc-800 disabled:bg-zinc-500 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
						>
							<Sparkles className="h-4 w-4" />
							{moderationIsGenerating ? "Generating..." : "Run Moderation"}
						</Button>
						{moderationError ? (
							<p className="rounded-md border border-black/20 bg-black/5 px-3 py-2 text-sm text-black dark:border-white/20 dark:bg-white/10 dark:text-white">
								{moderationError}
							</p>
						) : null}
					</div>

					<div className="min-h-[440px] space-y-4 border-black/15 md:border-l md:pl-6 dark:border-white/20">
						{moderationResult ? (
							<div className="space-y-2 rounded-md border border-black/15 bg-black/[0.02] p-3 text-sm dark:border-white/20 dark:bg-white/[0.03]">
								<p>
									<span className="font-medium">Flagged:</span>{" "}
									{moderationResult.flagged ? "Yes" : "No"}
								</p>
								<p>
									<span className="font-medium">Flagged categories:</span>{" "}
									{flaggedCategories.length
										? flaggedCategories.join(", ")
										: "None"}
								</p>
							</div>
						) : null}
						{moderationRawResponse ? (
							<pre className="max-h-[320px] overflow-auto rounded-md border border-black/15 bg-black/[0.02] p-3 text-xs text-black dark:border-white/20 dark:bg-white/[0.03] dark:text-white">
								{moderationRawResponse}
							</pre>
						) : showModerationThinkingState ? (
							renderThinkingPanel()
						) : showEmptyModerationResponse ? (
							renderEmptyPanel("Moderation output appears here.")
						) : null}
					</div>
				</div>
			);
		}

		return null;
	};

	return (
		<div className="w-full space-y-4">
			<div className="space-y-2">
				<h2 className="text-2xl font-semibold tracking-tight">Try {modelName}</h2>
				<p className="text-base text-muted-foreground">
					Test this model directly in the playground.
				</p>
			</div>

			<div className="space-y-4 text-black dark:text-white">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-3 dark:border-white/15">
					<div className="inline-flex items-center rounded-md border border-black/20 p-1 dark:border-white/25">
						{availableModeConfigs.map((config) => {
							const isActive = mode === config.mode;
							return (
								<button
									key={config.mode}
									type="button"
									onClick={() => setMode(config.mode)}
									className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium transition-colors ${
										isActive
											? "bg-black text-white dark:bg-white dark:text-black"
											: "text-black/75 hover:bg-black/5 dark:text-white/75 dark:hover:bg-white/10"
									}`}
									aria-pressed={isActive}
								>
									{renderModeIcon(config.mode)}
									{config.label}
								</button>
							);
						})}
					</div>
					<div className="ml-auto flex items-center gap-3">
						{mode === "text"
							? isGenerating ? (
									<div className="inline-flex items-center gap-1.5 text-xs text-black/70 dark:text-white/70">
										<Clock3 className="h-3.5 w-3.5" />
										{formatDuration(elapsedMs)}
									</div>
								) : stats ? (
									<div className="text-xs text-black/70 dark:text-white/70">
										{`${formatDuration(stats.elapsedMs)} | ${formatTokens(
											stats.totalTokens,
										)} | ${formatThroughput(
											stats.throughputTokensPerSecond,
										)} | ${formatCost(stats.totalCostUsd)}`}
									</div>
								) : null
							: mode === "audio"
								? audioIsGenerating ? (
										<div className="inline-flex items-center gap-1.5 text-xs text-black/70 dark:text-white/70">
											<Clock3 className="h-3.5 w-3.5" />
											{formatDuration(audioElapsedMs)}
										</div>
									) : audioStats ? (
										<div className="text-xs text-black/70 dark:text-white/70">
											{`${formatDuration(audioStats.elapsedMs)} | ${formatTokens(
												audioStats.totalTokens,
											)} | ${formatThroughput(
												audioStats.throughputTokensPerSecond,
											)} | ${formatCost(audioStats.totalCostUsd)}`}
										</div>
									) : null
								: null}
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsCodeDialogOpen(true)}
							className="h-9 border-black/30 bg-white text-black hover:bg-zinc-100 dark:border-white/30 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
						>
							<Code2 className="h-4 w-4" />
							Get Code
						</Button>
					</div>
				</div>

				{mode === "text" ? (
					<div className="grid gap-6 md:grid-cols-2">
						<div className="flex min-h-[440px] flex-col gap-3">
							<Textarea
								value={prompt}
								onChange={(event) => setPrompt(event.target.value)}
								onKeyDown={handlePromptKeyDown}
								placeholder="Enter your message..."
								className="min-h-[320px] resize-none border-black/20 bg-white text-base text-black placeholder:text-black/45 focus-visible:ring-black/40 dark:border-white/25 dark:bg-black dark:text-white dark:placeholder:text-white/50 dark:focus-visible:ring-white/40"
							/>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<Button
									type="button"
									asChild
									variant="outline"
									className="h-11 w-full border-black/30 bg-white text-black hover:bg-zinc-100 dark:border-white/30 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
								>
									<Link href={chatHref}>
										<MessageSquare className="h-4 w-4" />
										Open in Playground
									</Link>
								</Button>
								<Button
									type="button"
									onClick={handleGenerate}
									disabled={!hasPrompt || isGenerating}
									className="h-11 w-full bg-black text-white hover:bg-zinc-800 disabled:bg-zinc-500 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
								>
									<Sparkles className="h-4 w-4" />
									{isGenerating ? "Generating..." : "Generate"}
								</Button>
							</div>
							{error ? (
								<p className="rounded-md border border-black/20 bg-black/5 px-3 py-2 text-sm text-black dark:border-white/20 dark:bg-white/10 dark:text-white">
									{error}
								</p>
							) : null}
						</div>

						<div className="min-h-[440px] border-black/15 md:border-l md:pl-6 dark:border-white/20">
							{responseText ? (
								<div className="text-sm leading-6 text-black dark:text-white">
									<Streamdown>{responseText}</Streamdown>
								</div>
							) : showThinkingState ? (
								<div className="flex h-full flex-col items-center justify-center gap-3 text-black/55 dark:text-white/65">
									<TerminalSquare className="h-10 w-10" />
									<div className="flex items-end gap-1.5">
										<span
											className="h-2.5 w-2.5 animate-bounce rounded-full bg-current"
											style={{ animationDelay: "0ms" }}
										/>
										<span
											className="h-2.5 w-2.5 animate-bounce rounded-full bg-current"
											style={{ animationDelay: "140ms" }}
										/>
										<span
											className="h-2.5 w-2.5 animate-bounce rounded-full bg-current"
											style={{ animationDelay: "280ms" }}
										/>
									</div>
								</div>
							) : showEmptyResponse ? (
								<div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-black/55 dark:text-white/60">
									<TerminalSquare className="h-10 w-10" />
									<p>Response output appears here.</p>
								</div>
							) : null}
						</div>
					</div>
				) : (
					renderInlineRoom()
				)}
			</div>

			<Dialog open={isCodeDialogOpen} onOpenChange={setIsCodeDialogOpen}>
				<DialogContent className="h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:w-[96vw] sm:max-w-6xl sm:rounded-lg">
					<div className="flex h-full max-h-[100dvh] flex-col sm:max-h-[90vh]">
						<DialogHeader className="border-b border-black/10 p-4 pr-12 sm:p-5 sm:pr-12 dark:border-white/15">
							<DialogTitle>Get Code</DialogTitle>
							<DialogDescription>
								Ready-to-copy snippets for {modelName} across raw HTTP,
								OpenAI SDK, and AI Stats SDK integrations.
							</DialogDescription>
						</DialogHeader>

						<div className="flex-1 overflow-y-auto p-4 sm:p-5">
							<div className="space-y-4">
								<div className="-mx-1 overflow-x-auto pb-1">
									<div className="flex w-max min-w-full gap-2 px-1">
										{codeCategories.map((category) => {
											const isActive = category === selectedCodeCategory;
											return (
												<button
													key={category}
													type="button"
													onClick={() => handleSelectCodeCategory(category)}
													className={`whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
														isActive
															? "border-black/20 bg-black/10 text-black dark:border-white/30 dark:bg-white/20 dark:text-white"
															: "border-black/15 bg-white text-black/80 hover:bg-black/[0.03] dark:border-white/20 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
													}`}
													aria-pressed={isActive}
												>
													{category}
												</button>
											);
										})}
									</div>
								</div>

								<div className="-mx-1 overflow-x-auto border-b border-black/10 pb-2 dark:border-white/15">
									<div className="flex w-max min-w-full items-center gap-4 px-1 text-sm">
										{snippetsForSelectedCategory.map((snippet) => {
											const isActive = snippet.id === selectedCodeSnippetId;
											const logoId = getSnippetLogoId(snippet);
											return (
												<button
													key={snippet.id}
													type="button"
													onClick={() => setSelectedCodeSnippetId(snippet.id)}
													className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-1.5 transition-colors ${
														isActive
															? "border-black text-black dark:border-white dark:text-white"
															: "border-transparent text-black/65 hover:text-black dark:text-white/65 dark:hover:text-white"
													}`}
													aria-pressed={isActive}
												>
													<span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
														{logoId ? (
															<Logo
																id={logoId}
																alt={`${snippet.label} icon`}
																width={14}
																height={14}
																className="object-contain"
															/>
														) : snippet.lang === "bash" ? (
															<TerminalSquare className="h-3.5 w-3.5" />
														) : (
															<Code2 className="h-3.5 w-3.5" />
														)}
													</span>
													{snippet.label}
												</button>
											);
										})}
									</div>
								</div>

								{selectedCodeSnippet ? (
									<div className="space-y-3">
										<div className="space-y-1">
											<p className="text-xs font-medium uppercase tracking-wide text-black/60 dark:text-white/60">
												{selectedCodeSnippet.category}
											</p>
											<p className="text-sm text-black/70 dark:text-white/70">
												{selectedCodeSnippet.description}
											</p>
										</div>

										{selectedCodeSnippet.installCommand ? (
											<div className="space-y-2">
												<p className="text-xs font-medium text-black/70 dark:text-white/70">
													Install
												</p>
												<CodeBlock
													code={selectedCodeSnippet.installCommand}
													lang="bash"
													label="bash"
												/>
											</div>
										) : null}

										<div className="space-y-2">
											<p className="text-xs font-medium text-black/70 dark:text-white/70">
												Usage
											</p>
											<CodeBlock
												code={selectedCodeSnippet.code}
												lang={selectedCodeSnippet.lang}
												label={selectedCodeSnippet.lang}
											/>
										</div>
									</div>
								) : null}
							</div>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
