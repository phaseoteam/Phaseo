// src/components/gateway/Quickstart.tsx
"use client";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import CodeBlock from "@/components/(data)/model/quickstart/CodeBlock";
import Link from "next/link";
import { TerminalSquare, ArrowRight, Shield, Info } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { BASE_URL } from "./config";
import { safeDecodeURIComponent } from "@/lib/utils/safe-decode";
import { capabilityToEndpoints } from "@/lib/config/capabilityToEndpoints";     
import { resolveGatewayPath } from "./endpoint-paths";
import { Switch } from "@/components/ui/switch";
import { useEffect, useMemo, useState } from "react";

interface QuickstartProps {
        modelId?: string;
        aliases?: string[];
        apiModelIds?: string[];
        primaryModelIdentifier?: string;
        acceptedModelIdentifiers?: string[];
        primaryModelIdentifierByEndpoint?: Record<string, string>;
        acceptedModelIdentifiersByEndpoint?: Record<string, string[]>;
        endpoint?: string | null;
        supportedEndpoints?: string[];
        showHeader?: boolean;
}

const normalizeEndpointValue = (value: string | null | undefined) =>
        value
                ? value.toLowerCase().replace(/^\//, "").replace(/\//g, ".")
                : "";

const endpointValueFromPath = (path: string) =>
        normalizeEndpointValue(path);

function resolveSpeechVoiceForModel(model: string): string {
        const provider = model.split("/")[0]?.toLowerCase();
        if (provider === "xiaomi") return "mimo_default";
        if (provider === "google" || provider === "google-ai-studio") return "Kore";
        if (provider === "elevenlabs" || provider === "eleven-labs") return "rachel";
        return "alloy";
}

function buildExamplePayload(
        endpoint: string | null | undefined,
        model: string
) {
        const normalized = normalizeEndpointValue(endpoint);
        switch (normalized) {
                case "responses":
                        return {
                                model,
                                input: "Give me one fun fact about cURL.",
                        };
                case "messages":
                        return {
                                model,
                                messages: [
                                        { role: "user", content: "Summarize the latest AI Stats metrics." },
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
					"Route requests across providers with AI Stats.",
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
                                image_url: "https://assets.ai-stats.com/sample-image.png",
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
                                input: "Welcome to the AI Stats Gateway where latency, uptime, and pricing are in your control.",
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
                                audio_url: "https://assets.ai-stats.com/sample-audio.wav",
                                language: "en",
                        };
                case "audio.translations":
                case "audio.translation":
                        return {
                                model,
                                audio_url: "https://assets.ai-stats.com/sample-audio.wav",
                                target_language: "en",
                        };
                case "batch.create":
                case "batch":
                        return {
                                input_file_id: "file_abc123",
                                endpoint: "/responses",
                                completion_window: "24h",
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

const jsonToPythonLiteral = (json: string) =>
        json
                .replace(/true/g, "True")
                .replace(/false/g, "False")
                .replace(/null/g, "None");

const buildStreamingDiff = (payloadJson: string) => {
        const lines = payloadJson.split("\n");
        const diffLines = lines.map((line) => ` ${line}`);
        const indentMatch = lines[1]?.match(/^\s*/);
        const indent = indentMatch ? indentMatch[0] : "  ";
        const insertIndex = lines.findIndex((line) =>
                line.includes('"model"')
        );
        const targetIndex = insertIndex >= 0 ? insertIndex + 1 : 1;
        diffLines.splice(targetIndex, 0, `+${indent}"stream": true,`);
        return diffLines.join("\n");
};

type EndpointOption = {
        value: string;
        label: string;
};

const ENDPOINT_OPTIONS: EndpointOption[] = [
        { value: "responses", label: "Responses" },
        { value: "chat.completions", label: "Chat Completions" },
        { value: "messages", label: "Messages" },
        { value: "embeddings", label: "Embeddings" },
        { value: "moderations", label: "Moderations" },
        { value: "moderations.create", label: "Moderations (Create)" },
        { value: "images.generations", label: "Image Generation" },
        { value: "images.edits", label: "Image Edits" },
        { value: "video.generations", label: "Video Generation" },
        { value: "audio.speech", label: "Audio Speech" },
        { value: "audio.realtime", label: "Audio Realtime" },
        { value: "audio.transcriptions", label: "Audio Transcription" },
        { value: "audio.translations", label: "Audio Translation" },
        { value: "batch.create", label: "Batch Create" },
        { value: "music.generate", label: "Music Generation" },
];

type LanguageOption = {
        value: string;
        label: string;
        disabled: boolean;
};

const LANGUAGE_OPTIONS: LanguageOption[] = [
        { value: "curl", label: "cURL", disabled: false },
        { value: "node-fetch", label: "Node.js fetch", disabled: false },       
        { value: "python-requests", label: "Python requests", disabled: false },
        { value: "ai-sdk", label: "AI SDK", disabled: false },
        { value: "typescript-sdk", label: "TypeScript SDK", disabled: false },  
        { value: "python-sdk", label: "Python SDK", disabled: false },
        { value: "go-sdk", label: "Go SDK", disabled: false },     
        { value: "csharp-sdk", label: "C# SDK", disabled: false }, 
        { value: "php-sdk", label: "PHP SDK", disabled: false },   
        { value: "ruby-sdk", label: "Ruby SDK", disabled: false }, 
        { value: "openai-python", label: "OpenAI Python Client", disabled: false },
        { value: "openai-node", label: "OpenAI Node.js Client", disabled: false },
];

const STREAMING_PATHS = new Set(["/chat/completions", "/responses", "/messages"]);
const AI_SDK_ENDPOINTS = new Set(["chat.completions", "messages", "responses"]);

const AI_STATS_METHODS: Record<string, { ts: string; py: string }> = {
        "chat.completions": { ts: "generateText", py: "generate_text" },
        responses: { ts: "generateResponse", py: "generate_response" },
        embeddings: { ts: "generateEmbedding", py: "generate_embedding" },
        moderations: { ts: "generateModeration", py: "generate_moderation" },
        "moderations.create": { ts: "generateModeration", py: "generate_moderation" },
        "images.generations": { ts: "generateImage", py: "generate_image" },
        "images.edits": { ts: "generateImageEdit", py: "generate_image_edit" },
        "audio.speech": { ts: "generateSpeech", py: "generate_speech" },
        "audio.transcriptions": { ts: "generateTranscription", py: "generate_transcription" },
        "audio.translations": { ts: "generateTranslation", py: "generate_translation" },
        "video.generations": { ts: "generateVideo", py: "generate_video" },
        "batch.create": { ts: "createBatch", py: "create_batch" },
};

const OPENAI_METHODS: Record<string, { ts: string; py: string }> = {
        "chat.completions": { ts: "chat.completions.create", py: "chat.completions.create" },
        responses: { ts: "responses.create", py: "responses.create" },
};

export default function Quickstart({
	modelId,
	aliases,
	apiModelIds,
	primaryModelIdentifier,
	acceptedModelIdentifiers,
	primaryModelIdentifierByEndpoint,
	acceptedModelIdentifiersByEndpoint,
	endpoint,
	supportedEndpoints = [],
	showHeader = true,
}: QuickstartProps) {
        const supportedEndpointValues = useMemo(() => {
                const normalized = new Set(
                        supportedEndpoints.map((value) =>
                                normalizeEndpointValue(value)
                        )
                );
                const values = new Set<string>();
                for (const value of normalized) {
                        const mapped = capabilityToEndpoints[value];
                        if (mapped && mapped.length > 0) {
                                mapped.forEach((path) =>
                                        values.add(endpointValueFromPath(path))
                                );
                                if (ENDPOINT_OPTIONS.some((option) => option.value === value)) {
                                        values.add(value);
                                }
                                continue;
                        }
                        if (value) values.add(value);
                }
                if (endpoint) {
                        values.add(normalizeEndpointValue(endpoint));
                }
                return values;
        }, [supportedEndpoints, endpoint]);

        const availableEndpoints = useMemo(() => {
                const filtered = ENDPOINT_OPTIONS.filter((option) =>
                        supportedEndpointValues.has(option.value)
                );
                return filtered.length > 0 ? filtered : ENDPOINT_OPTIONS;
        }, [supportedEndpointValues]);

        const defaultEndpoint = useMemo(() => {
                return (
                        availableEndpoints.find((e) => e.value === "responses")?.value ||
                        availableEndpoints.find((e) => e.value === "chat.completions")?.value ||
                        availableEndpoints.find((e) => e.value === "messages")?.value ||
                        availableEndpoints[0]?.value ||
                        "chat.completions"
                );
        }, [availableEndpoints]);

        const [selectedEndpoint, setSelectedEndpoint] = useState(defaultEndpoint);
        const [selectedLanguage, setSelectedLanguage] = useState("curl");       
        const [streamingEnabled, setStreamingEnabled] = useState(false);

        useEffect(() => {
                if (!availableEndpoints.some((e) => e.value === selectedEndpoint)) {
                        setSelectedEndpoint(defaultEndpoint);
                }
        }, [availableEndpoints, defaultEndpoint, selectedEndpoint]);

        const supportedLanguageSet = useMemo(() => {
                const normalizedEndpoint = normalizeEndpointValue(selectedEndpoint);
                const supported = new Set<string>([
                        "curl",
                        "node-fetch",
                        "python-requests",
                        "go-sdk",
                        "csharp-sdk",
                        "php-sdk",
                        "ruby-sdk",
                ]);
                if (AI_SDK_ENDPOINTS.has(normalizedEndpoint)) {
                        supported.add("ai-sdk");
                }
                if (AI_STATS_METHODS[normalizedEndpoint]) {
                        supported.add("typescript-sdk");
                        supported.add("python-sdk");
                }
                if (OPENAI_METHODS[normalizedEndpoint]) {
                        supported.add("openai-python");
                        supported.add("openai-node");
                }
                return supported;
        }, [selectedEndpoint]);

        const availableLanguages = useMemo(
                () =>
                        LANGUAGE_OPTIONS.filter((option) =>
                                supportedLanguageSet.has(option.value)
                        ),
                [supportedLanguageSet]
        );

        useEffect(() => {
                if (!supportedLanguageSet.has(selectedLanguage)) {
                        const fallback =
                                availableLanguages.find(
                                        (option) =>
                                                supportedLanguageSet.has(option.value) &&
                                                !option.disabled
                                )?.value || "curl";
                        setSelectedLanguage(fallback);
                }
        }, [availableLanguages, selectedLanguage, supportedLanguageSet]);       

        const supportsStreaming = useMemo(() => {
                const normalized = normalizeEndpointValue(selectedEndpoint);
                if (!normalized) return false;
                if (
                        normalized === "chat.completions" ||
                        normalized === "responses" ||
                        normalized === "messages"
                ) {
                        return true;
                }
                const mapped = capabilityToEndpoints[normalized] ?? [];
                return mapped.some((value) => STREAMING_PATHS.has(value));
        }, [selectedEndpoint]);

        useEffect(() => {
                if (!supportsStreaming && streamingEnabled) {
                        setStreamingEnabled(false);
                }
        }, [supportsStreaming, streamingEnabled]);

        const normalizedSelectedEndpoint = normalizeEndpointValue(selectedEndpoint);

        const endpointPrimaryModelIdentifier =
                primaryModelIdentifierByEndpoint?.[normalizedSelectedEndpoint] ??
                primaryModelIdentifier;

        const endpointAcceptedIdentifiers =
                acceptedModelIdentifiersByEndpoint?.[normalizedSelectedEndpoint] ??
                acceptedModelIdentifiers ??
                [];

        const decodedAcceptedIdentifiers = Array.from(
                new Set([
                        ...(endpointAcceptedIdentifiers.map((identifier) =>
                                safeDecodeURIComponent(identifier)
                        ) ?? []),
                        ...(endpointAcceptedIdentifiers.length === 0
                                ? [
                                          ...(apiModelIds?.map((identifier) =>
                                                  safeDecodeURIComponent(identifier)
                                          ) ?? []),
                                          ...(aliases?.map((alias) =>
                                                  safeDecodeURIComponent(alias)
                                          ) ?? []),
                                  ]
                                : []),
                ])
        ).filter(Boolean);

        const model =
                safeDecodeURIComponent(endpointPrimaryModelIdentifier) ||
                decodedAcceptedIdentifiers[0] ||
                safeDecodeURIComponent(modelId) ||
                "model_id_here";
        const endpointPath = resolveGatewayPath(selectedEndpoint);
        const endpointUrl = `${BASE_URL}${endpointPath}`;
        const payload = buildExamplePayload(selectedEndpoint, model);
        const payloadJson = JSON.stringify(payload, null, 2);
        const rawSdkPayloadJson = payloadJson;
        const payloadJsonStream = supportsStreaming
                ? JSON.stringify({ ...payload, stream: true }, null, 2)
                : payloadJson;
        const shouldStream = supportsStreaming && streamingEnabled;
        const activePayloadJson = shouldStream ? payloadJsonStream : payloadJson;
        const payloadJsonNode = activePayloadJson
                .split("\n")
                .map((line) => `        ${line}`)
                .join("\n");
        const payloadJsonPython = jsonToPythonLiteral(activePayloadJson);
        const streamPayloadJsonNode = payloadJsonStream
                .split("\n")
                .map((line) => `        ${line}`)
                .join("\n");
        const streamPayloadJsonPython = jsonToPythonLiteral(payloadJsonStream);
        const aliasList = Array.from(
                new Set([
                        model,
                        ...decodedAcceptedIdentifiers,
                ])
        ).filter(Boolean);
        const streamingDiff = supportsStreaming
                ? buildStreamingDiff(payloadJson)
                : "";

        function getInstallationCode(language: string): string {
                switch (language) {
                        case "ai-sdk":
                                return "npm install ai @ai-sdk/openai";
                        case "typescript-sdk":
                                return "npm install @ai-stats/sdk";
			case "python-sdk":
				return "pip install ai-stats";
			case "go-sdk":
				return "go get github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go@latest";
			case "csharp-sdk":
				return "dotnet add package AI.Stats.Sdk";
			case "php-sdk":
				return "composer require ai-stats/php-sdk";
			case "ruby-sdk":
				return "gem install ai_stats_sdk";
			case "openai-python":
				return "pip install openai";
			case "openai-node":
				return "npm install openai";
			default:
				return "";
		}
	}

        const curlCommandLabel = shouldStream
                ? "Send a streaming request"
                : "Send a request";
        const curlFlags = shouldStream ? "-N -s" : "-s";
        const curlQuickstart = `# 1) Set your key
export AI_STATS_API_KEY="aistats_***"

# 2) ${curlCommandLabel}
curl ${curlFlags} ${endpointUrl} \\
-H "Authorization: Bearer $AI_STATS_API_KEY" \\
-H "Content-Type: application/json" \\
-d '${activePayloadJson}'`;

	const nodeQuickstart =
		`// 1) Set your key
const apiKey = process.env.AI_STATS_API_KEY;

// 2) Send a request
const res = await fetch("${endpointUrl}", {
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		"Authorization": ` +
		"`Bearer ${apiKey}`" +
		`,
	},
	body: JSON.stringify({
${payloadJsonNode}
	}),
});

const data = await res.json();

console.log(data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2));`;

	const pythonQuickstart = `# Import os and requests libraries
import os
import requests

# Get your API key
API_KEY = os.environ.get("AI_STATS_API_KEY")

# Send a request
url = "${endpointUrl}"
payload = ${payloadJsonPython}

resp = requests.post(url, json=payload, headers={
	"Authorization": f"Bearer {API_KEY}",
	"Content-Type": "application/json",
})

data = resp.json()

print(data.get("choices", [])[0].get("message", {}).get("content") if data.get("choices") else data)`;

        const normalizedEndpoint = normalizeEndpointValue(selectedEndpoint);    
        const aiStatsMethod = AI_STATS_METHODS[normalizedEndpoint];
        const openaiMethod = OPENAI_METHODS[normalizedEndpoint];
        const aiSdkPrompt = (() => {
                const payloadValue = payload as Record<string, unknown>;
                const input = payloadValue.input;
                if (typeof input === "string") return input;
                const messages = payloadValue.messages as
                        | Array<{ role?: string; content?: string }>
                        | undefined;
                const userMessage = messages?.find(
                        (message) =>
                                message?.role === "user" &&
                                typeof message?.content === "string"
                );
                return (
                        userMessage?.content ??
                        "Give me one fun fact about cURL."
                );
        })();
        const aiSdkPromptLiteral = JSON.stringify(aiSdkPrompt);

        const typescriptSdkUsage = aiStatsMethod
                ? `import { AIStats } from '@ai-stats/sdk';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
});

const response = await client.${aiStatsMethod.ts}({
${payloadJsonNode}
});

console.log(response);`
                : null;

        const aiSdkUsage = AI_SDK_ENDPOINTS.has(normalizedEndpoint)
                ? shouldStream
                        ? `import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  apiKey: process.env.AI_STATS_API_KEY,
  baseURL: "${BASE_URL}",
});

const { textStream } = await streamText({
  model: openai("${model}"),
  prompt: ${aiSdkPromptLiteral},
});

for await (const chunk of textStream) {
  process.stdout.write(chunk);
}`
                        : `import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  apiKey: process.env.AI_STATS_API_KEY,
  baseURL: "${BASE_URL}",
});

const { text } = await generateText({
  model: openai("${model}"),
  prompt: ${aiSdkPromptLiteral},
});

console.log(text);`
                : null;

        const pythonSdkUsage = aiStatsMethod
                ? `import os
from ai_stats import AIStats

client = AIStats(api_key=os.environ.get("AI_STATS_API_KEY"))

payload = ${payloadJsonPython}
response = client.${aiStatsMethod.py}(payload)

print(response)`
                : null;

	const goSdkUsage = `package main

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

    payloadJSON := \`${rawSdkPayloadJson}\`
    var payload map[string]any
    if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
        panic(err)
    }

    response, err := client.Request(context.Background(), "POST", "${endpointPath}", nil, nil, payload)
    if err != nil {
        panic(err)
    }

    fmt.Println(response)
}`;

	const csharpSdkUsage = `using System.Collections.Generic;
using System.Text.Json;
using AiStatsSdk;

var client = new AIStats();
var payload = JsonSerializer.Deserialize<Dictionary<string, object>>("""
${rawSdkPayloadJson}
""");

var response = await client.RawClient.SendAsync<object>(
    method: "POST",
    path: "${endpointPath}",
    body: payload
);

Console.WriteLine(JsonSerializer.Serialize(response, new JsonSerializerOptions
{
    WriteIndented = true
}));`;

	const phpSdkUsage = `<?php
require 'vendor/autoload.php';

use AIStats\\Sdk\\AIStats;

$client = new AIStats(apiKey: getenv('AI_STATS_API_KEY'));
$payload = json_decode(<<<'JSON'
${rawSdkPayloadJson}
JSON, true, 512, JSON_THROW_ON_ERROR);

$response = $client->rawClient()->request(
    "POST",
    "${endpointPath}",
    null,
    null,
    $payload
);

echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;`;

	const rubySdkUsage = `require "json"
require "ai_stats_sdk"

client = AIStatsSdk::AIStats.new
payload = JSON.parse(<<~JSON)
${rawSdkPayloadJson}
JSON

response = client.raw_client.request(
  method: "post",
  path: "${endpointPath}",
  body: payload
)

puts JSON.pretty_generate(response)`;

        const nodeFetchQuickstart = `// 1) Set your key
const apiKey = process.env.AI_STATS_API_KEY;

// 2) Send a request
const res = await fetch("${endpointUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": \`Bearer \${apiKey}\`,
  },
  body: JSON.stringify({
${payloadJsonNode}
  }),
});

const data = await res.json();

console.log(data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2));`;

        const nodeFetchStreamingQuickstart = `// 1) Set your key
const apiKey = process.env.AI_STATS_API_KEY;

// 2) Send a streaming request
const res = await fetch("${endpointUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": \`Bearer \${apiKey}\`,
  },
  body: JSON.stringify({
${streamPayloadJsonNode}
  }),
});

if (!res.body) {
  throw new Error("No streaming body from server");
}

const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value, { stream: true });
  process.stdout.write(chunk);
}`;

        const pythonRequestsQuickstart = `# Import os and requests libraries    
import os
import requests

# Get your API key
API_KEY = os.environ.get("AI_STATS_API_KEY")

# Send a request
url = "${endpointUrl}"
payload = ${payloadJsonPython}

resp = requests.post(url, json=payload, headers={
	"Authorization": f"Bearer {API_KEY}",
	"Content-Type": "application/json",
})

data = resp.json()

print(data.get("choices", [])[0].get("message", {}).get("content") if data.get("choices") else data)`;

        const pythonRequestsStreamingQuickstart = `# Import os and requests libraries
import os
import requests

# Get your API key
API_KEY = os.environ.get("AI_STATS_API_KEY")

# Send a streaming request
url = "${endpointUrl}"
payload = ${streamPayloadJsonPython}

with requests.post(url, json=payload, headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
}, stream=True) as resp:
        for line in resp.iter_lines(decode_unicode=True):
                if line:
                        print(line)`;

        const openaiPythonUsage = openaiMethod
                ? `import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("AI_STATS_API_KEY"),
    base_url="${BASE_URL}",
)

payload = ${payloadJsonPython}
response = client.${openaiMethod.py}(**payload)

print(response)`
                : null;

	const openaiNodeUsage = openaiMethod
		? `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.AI_STATS_API_KEY,
  baseURL: '${BASE_URL}',
});

const response = await client.${openaiMethod.ts}({
${payloadJsonNode}
});

console.log(response);`
		: null;

	const compactMode = !showHeader;

	return (
		<section className="space-y-6">
			{showHeader ? (
				<header className="space-y-1">
					<h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
						<TerminalSquare className="h-5 w-5 text-primary" />
						Quickstart
					</h2>
					<p className="text-sm text-muted-foreground">
						Use one of the accepted identifiers below for the selected endpoint.
					</p>
				</header>
			) : null}
			<div className="space-y-6">
				{compactMode ? null : (
					<>
						<Alert>
							<Info className="h-4 w-4" />
							<AlertTitle>Model identifiers</AlertTitle>
							<AlertDescription className="text-sm">
								{aliasList.length > 0 ? (
									<span className="flex flex-wrap gap-2">
										{aliasList.map((identifier) => (
											<code
												key={identifier}
												className="rounded bg-muted px-2 py-1 text-xs font-mono select-all cursor-text"
												title={identifier}
											>
												{identifier}
											</code>
										))}
									</span>
								) : (
									"Use the model ID shown above when configuring your requests."
								)}
							</AlertDescription>
						</Alert>

						<div className="space-y-3">
							<h3 className="text-base font-semibold">1) Get an API key</h3>
							<p className="text-sm text-muted-foreground">
								Create a key in
								<Link
									href="/settings/keys"
									className="inline-flex items-center gap-2 rounded px-2 py-1 text-sm font-medium text-primary hover:bg-primary/5"
								>
									<span>Dashboard</span>
									<ArrowRight className="h-4 w-4" />
									<span>API Keys</span>
								</Link>
								, then set it as{" "}
								<code className="bg-gray-400/20 p-1 rounded-md">
									AI_STATS_API_KEY
								</code>{" "}
								in your environment variables.
							</p>

							<Alert variant="destructive">
								<Shield className="h-4 w-4" />
								<AlertTitle>Keep your API key secret</AlertTitle>
								<AlertDescription className="text-sm">
									This key grants access to all models and your credits.
									Treat it like a password, do not share it, commit it to
									source control, or expose it in client-side code. Rotate
									keys immediately if you suspect compromise.
								</AlertDescription>
							</Alert>
						</div>
					</>
				)}

				<div className={compactMode ? "space-y-2" : "space-y-3"}>
					{compactMode ? null : (
						<h3 className="text-base font-semibold">
							2) Choose endpoint, language, and streaming
						</h3>
					)}
					<div className="grid gap-4 md:grid-cols-3">
						<div className="space-y-1">
							<label className="text-sm font-medium">Endpoint</label>
							<Select
								value={selectedEndpoint}
								onValueChange={setSelectedEndpoint}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{availableEndpoints.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<label className="text-sm font-medium">Language</label>
							<Select
								value={selectedLanguage}
								onValueChange={setSelectedLanguage}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{availableLanguages.map((option) => (
										<SelectItem
											key={option.value}
											value={option.value}
											disabled={option.disabled}
										>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium">Streaming</label>
							<div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
								<div className="flex items-center gap-2">
									<Switch
										checked={streamingEnabled}
										onCheckedChange={setStreamingEnabled}
										disabled={!supportsStreaming}
									/>
									<span className="text-sm font-medium">Enable SSE</span>
								</div>
							</div>
							{compactMode ? null : (
								<p className="text-xs text-muted-foreground">
									{supportsStreaming
										? 'Add "stream": true to receive token events.'
										: "Streaming isn't available for this endpoint."}
								</p>
							)}
						</div>
					</div>
				</div>

				<div className={compactMode ? "space-y-2" : "space-y-3"}>
					{compactMode ? null : (
						<h3 className="text-base font-semibold">3) Send your first request</h3>
					)}
					{/* Installation step for SDKs */}
					{(selectedLanguage.includes("sdk") ||
						selectedLanguage.includes("openai")) && (
						<div className="space-y-2">
							{compactMode ? null : (
							<h4 className="text-sm font-medium">
								Installation
							</h4>
							)}
							<CodeBlock
								code={getInstallationCode(selectedLanguage)}
								lang="bash"
								label="bash"
							/>
						</div>
					)}
					{supportsStreaming && streamingEnabled ? (
						<div className="space-y-2">
							{compactMode ? null : (
								<h4 className="text-sm font-medium">Streaming change</h4>
							)}
							<CodeBlock code={streamingDiff} lang="diff" label="diff" />
						</div>
					) : null}
					{/* Usage code */}
					<div className="space-y-2">
						{compactMode ? null : (
							<h4 className="text-sm font-medium">
								{selectedLanguage.includes("sdk") ||
								selectedLanguage.includes("openai")
								? "Usage"
								: "Code"}
							</h4>
						)}
						{selectedLanguage === "curl" && (
							<CodeBlock
								code={curlQuickstart}
								lang="bash"
								label="bash"
							/>
						)}
						{selectedLanguage === "typescript-sdk" &&
						typescriptSdkUsage && (
							<CodeBlock code={typescriptSdkUsage} lang="ts" label="ts" />
						)}
						{selectedLanguage === "ai-sdk" && aiSdkUsage && (
							<CodeBlock code={aiSdkUsage} lang="ts" label="ts" />
						)}
						{selectedLanguage === "python-sdk" && pythonSdkUsage && (
							<CodeBlock code={pythonSdkUsage} lang="python" label="python" />
						)}
						{selectedLanguage === "go-sdk" && (
							<CodeBlock code={goSdkUsage} lang="go" label="go" />
						)}
						{selectedLanguage === "csharp-sdk" && (
							<CodeBlock
								code={csharpSdkUsage}
								lang="csharp"
								label="csharp"
							/>
						)}
						{selectedLanguage === "php-sdk" && (
							<CodeBlock
								code={phpSdkUsage}
								lang="php"
								label="php"
							/>
						)}
						{selectedLanguage === "ruby-sdk" && (
							<CodeBlock
								code={rubySdkUsage}
								lang="ruby"
								label="ruby"
							/>
						)}
						{selectedLanguage === "node-fetch" && (
							<CodeBlock
								code={
									shouldStream
										? nodeFetchStreamingQuickstart
										: nodeFetchQuickstart
								}
								lang="ts"
								label="ts"
							/>
						)}
						{selectedLanguage === "python-requests" && (
							<CodeBlock
								code={
									shouldStream
										? pythonRequestsStreamingQuickstart
										: pythonRequestsQuickstart
								}
								lang="python"
								label="python"
							/>
						)}
						{selectedLanguage === "openai-python" &&
						openaiPythonUsage && (
							<CodeBlock
								code={openaiPythonUsage}
								lang="python"
								label="python"
							/>
						)}
						{selectedLanguage === "openai-node" &&
						openaiNodeUsage && (
							<CodeBlock
								code={openaiNodeUsage}
								lang="ts"
								label="ts"
							/>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}
