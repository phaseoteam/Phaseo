// src/components/gateway/Quickstart.tsx
"use client";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import {
	ArrowRight,
	Check,
	ChevronDown,
	Globe,
	KeyRound,
	TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BASE_URL } from "./config";
import { safeDecodeURIComponent } from "@/lib/utils/safe-decode";
import { capabilityToEndpoints } from "@/lib/config/capabilityToEndpoints";     
import { resolveGatewayPath } from "./endpoint-paths";
import { EndpointRoutesTable } from "./EndpointRoutesTable";
import { QuickstartUsageSection } from "./QuickstartUsageSection";
import { buildEndpointRoutes, ENDPOINT_OPTIONS } from "./endpointRoutes";
import { AI_SDK_ENDPOINTS, AI_STATS_METHODS, DIRECT_LANGUAGE_ORDER, LANGUAGE_GROUP_META, LANGUAGE_GROUP_ORDER, LANGUAGE_OPTIONS, OPENAI_METHODS, STREAMING_PATHS, type LanguageOption } from "./quickstartSdkConfig";
import {
	applyRoutingPreferenceToPayload,
	buildExamplePayload,
	buildStreamingDiff,
	jsonToPythonLiteral,
	resolveRoutingPreference,
} from "./quickstartPayloads";
import { Switch } from "@/components/ui/switch";
import { useEffect, useMemo, useState } from "react";
import type { QuickstartRequestContext } from "./requestContext";

interface QuickstartProps {
	modelId?: string; aliases?: string[]; apiModelIds?: string[];
	primaryModelIdentifier?: string; acceptedModelIdentifiers?: string[];
	primaryModelIdentifierByEndpoint?: Record<string, string>;
	acceptedModelIdentifiersByEndpoint?: Record<string, string[]>;
	endpoint?: string | null; supportedEndpoints?: string[]; showHeader?: boolean;
	requestContext?: QuickstartRequestContext;
}

const normalizeEndpointValue = (value: string | null | undefined) =>
	value ? value.toLowerCase().replace(/^\//, "").replace(/\//g, ".") : "";

const endpointValueFromPath = (path: string) => normalizeEndpointValue(path);

function StepBadge({ value }: { value: string }) {
	return (
		<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
			{value}
		</span>
	);
}

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
	requestContext,
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

        const endpointRoutes = useMemo(
		() => buildEndpointRoutes(availableEndpoints),
		[availableEndpoints],
	);

        const [selectedEndpoint, setSelectedEndpoint] = useState(defaultEndpoint);
        const [selectedLanguage, setSelectedLanguage] = useState("curl");       
        const [streamingEnabled, setStreamingEnabled] = useState(false);
        const [showAllEndpointRoutes, setShowAllEndpointRoutes] = useState(false);

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
                        supported.add("agent-sdk-ts");
                        supported.add("agent-sdk-python");
                        supported.add("agent-sdk-go");
                        supported.add("agent-sdk-csharp");
                        supported.add("agent-sdk-php");
                        supported.add("agent-sdk-ruby");
                }
                if (AI_STATS_METHODS[normalizedEndpoint]) {
                        supported.add("typescript-sdk");
                        supported.add("python-sdk");
                }
                if (OPENAI_METHODS[normalizedEndpoint]) {
                        supported.add("openai-python");
                        supported.add("openai-node");
                }
		if (normalizedEndpoint === "messages") {
			supported.add("anthropic-python");
			supported.add("anthropic-node");
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

	const directLanguageOptions = useMemo(() => {
		return DIRECT_LANGUAGE_ORDER.map((value) =>
			availableLanguages.find((option) => option.value === value),
		).filter((option): option is LanguageOption => Boolean(option));
	}, [availableLanguages]);

	const availableLanguageGroups = useMemo(() => {
		const groupedLanguages = availableLanguages.filter(
			(option) => option.placement !== "direct",
		);
		return LANGUAGE_GROUP_ORDER.map((groupId) => ({
			...LANGUAGE_GROUP_META[groupId],
			id: groupId,
			options: groupedLanguages.filter((option) => option.group === groupId),
		})).filter((group) => group.options.length > 0);
	}, [availableLanguages]);

	const selectedLanguageOption = useMemo(
		() =>
			availableLanguages.find((option) => option.value === selectedLanguage) ??
			LANGUAGE_OPTIONS.find((option) => option.value === selectedLanguage) ??
			null,
		[availableLanguages, selectedLanguage],
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
        const routingPreference = resolveRoutingPreference(requestContext);
        const payload = applyRoutingPreferenceToPayload(
		buildExamplePayload(selectedEndpoint, model),
		routingPreference,
	);
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
                ? `import AIStats from '@ai-stats/sdk';

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
import { aiStats } from "@ai-stats/ai-sdk-provider";

const { textStream } = streamText({
  model: aiStats("${model}"),
  prompt: ${aiSdkPromptLiteral},
});

for await (const chunk of textStream) {
  process.stdout.write(chunk);
}`
                        : `import { generateText } from "ai";
import { aiStats } from "@ai-stats/ai-sdk-provider";

const { text } = await generateText({
  model: aiStats("${model}"),
  prompt: ${aiSdkPromptLiteral},
});

console.log(text);`
                : null;

	const agentSdkTsUsage = AI_SDK_ENDPOINTS.has(normalizedEndpoint)
		? `import {
  createAgent,
  createGatewayAgentClient,
} from "@ai-stats/agent-sdk";

const agent = createAgent({
  id: "quickstart-agent",
  model: "${model}",
  instructions: "Answer concisely and helpfully.",
});

const result = await agent.run({
  input: ${aiSdkPromptLiteral},
  client: createGatewayAgentClient({
    clientOptions: {
      apiKey: process.env.AI_STATS_API_KEY!,
    },
  }),
});

console.log(result.output);`
		: null;

	const agentSdkPythonUsage = AI_SDK_ENDPOINTS.has(normalizedEndpoint)
		? `from ai_stats_agent import create_agent, create_gateway_agent_client

agent = create_agent({
    "id": "quickstart-agent",
    "model": "${model}",
    "instructions": "Answer concisely and helpfully.",
})

result = agent.run(
    input=${aiSdkPromptLiteral},
    client=create_gateway_agent_client(),
)

print(result.output)`
		: null;

	const agentSdkGoUsage = AI_SDK_ENDPOINTS.has(normalizedEndpoint)
		? `package main

import (
  "context"
  "fmt"

  aistatsagent "github.com/AI-Stats/AI-Stats/packages/sdk/agent-sdk-go"
)

func main() {
  client, err := aistatsagent.CreateGatewayAgentClient(aistatsagent.GatewayAgentClientOptions{})
  if err != nil {
    panic(err)
  }

  agent := aistatsagent.CreateAgent(aistatsagent.AgentDefinition{
    ID:           "quickstart-agent",
    Model:        "${model}",
    Instructions: "Answer concisely and helpfully.",
  })

  result, err := agent.Run(context.Background(), aistatsagent.RunOptions{
    Input:  ${aiSdkPromptLiteral},
    Client: client,
  })
  if err != nil {
    panic(err)
  }

  fmt.Println(result.Output)
}`
		: null;

	const agentSdkCsharpUsage = AI_SDK_ENDPOINTS.has(normalizedEndpoint)
		? `using AiStatsAgentSdk;

var agent = AgentSdk.CreateAgent(new AgentDefinition
{
    Id = "quickstart-agent",
    Model = "${model}",
    Instructions = "Answer concisely and helpfully."
});

var result = await agent.Run(new RunOptions
{
    Input = ${aiSdkPromptLiteral},
    Client = AgentSdk.CreateGatewayAgentClient(),
});

Console.WriteLine(result.Output);`
		: null;

	const agentSdkPhpUsage = AI_SDK_ENDPOINTS.has(normalizedEndpoint)
		? `<?php
require "vendor/autoload.php";

use AIStats\\AgentSdk\\AgentDefinition;
use AIStats\\AgentSdk\\AgentSdk;

$agent = AgentSdk::createAgent(new AgentDefinition(
    id: "quickstart-agent",
    model: "${model}",
    instructions: "Answer concisely and helpfully."
));

$result = $agent->run(
    input: ${aiSdkPromptLiteral},
    client: AgentSdk::createGatewayAgentClient()
);

echo $result->output . PHP_EOL;`
		: null;

	const agentSdkRubyUsage = AI_SDK_ENDPOINTS.has(normalizedEndpoint)
		? `require "ai_stats_agent_sdk"

agent = AIStatsAgentSdk.create_agent(
  id: "quickstart-agent",
  model: "${model}",
  instructions: "Answer concisely and helpfully."
)

client = AIStatsAgentSdk.create_gateway_agent_client

result = agent.run(
  input: ${aiSdkPromptLiteral},
  client: client
)

puts result.output`
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

	const anthropicPythonUsage =
		normalizedEndpoint === "messages"
			? `import os
from anthropic import Anthropic

client = Anthropic(
    api_key=os.environ.get("AI_STATS_API_KEY"),
    base_url="${BASE_URL}",
)

payload = ${payloadJsonPython}
response = client.messages.create(**payload)

print(response)`
			: null;

	const anthropicNodeUsage =
		normalizedEndpoint === "messages"
			? `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.AI_STATS_API_KEY,
  baseURL: "${BASE_URL}",
});

const response = await client.messages.create({
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
			<div className={compactMode ? "space-y-4" : "space-y-5"}>
				<div className="grid gap-3 md:grid-cols-2">
					<div className="flex gap-3 rounded-xl border bg-muted/30 p-3">
						<StepBadge value="1" />
						<div className="min-w-0 space-y-1">
							<h3 className="text-sm font-semibold">Create or get an API key</h3>
							<div className="text-sm text-muted-foreground">
								Open{" "}
								<Button asChild variant="outline" size="sm" className="mx-1 h-7 px-2">
									<Link href="/settings/keys">
										<KeyRound className="h-3.5 w-3.5" />
										API Keys
									</Link>
								</Button>
								and set it as{" "}
								<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
									AI_STATS_API_KEY
								</code>
								. Keep the key server-side and rotate it if it is exposed.
							</div>
						</div>
					</div>
					<div className="flex gap-3 rounded-xl border bg-muted/30 p-3">
						<StepBadge value="2" />
						<div className="min-w-0 space-y-1">
							<h3 className="text-sm font-semibold">Copy a ready request</h3>
							<p className="text-sm text-muted-foreground">
								Choose an endpoint and language below, then copy the condensed
								example. The code updates when the selected route changes.
							</p>
						</div>
					</div>
				</div>

				{!compactMode && aliasList.length > 0 ? (
					<div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
						<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Accepted IDs
						</span>
						{aliasList.slice(0, 5).map((identifier) => (
							<code
								key={identifier}
								className="rounded bg-muted px-2 py-1 font-mono text-xs select-all"
								title={identifier}
							>
								{identifier}
							</code>
						))}
						{aliasList.length > 5 ? (
							<span className="text-xs text-muted-foreground">
								+{aliasList.length - 5} more
							</span>
						) : null}
					</div>
				) : null}

				<div className="space-y-3 rounded-xl border bg-card p-3">
					<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h3 className="text-sm font-semibold">Request setup</h3>
							<p className="text-xs text-muted-foreground">
								Endpoint, SDK style, and streaming are reflected in the code.
							</p>
						</div>
						<Link
							href="/settings/keys"
							className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
						>
							Manage keys
							<ArrowRight className="h-3.5 w-3.5" />
						</Link>
					</div>
					<div className="grid gap-3 md:grid-cols-3">
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
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										className="h-9 w-full justify-between border-zinc-200 bg-transparent px-3 text-sm font-normal shadow-xs dark:border-zinc-800"
									>
										<span className="truncate">
											{selectedLanguageOption?.label ?? "Choose language"}
										</span>
										<ChevronDown className="h-4 w-4 opacity-50" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="start"
									className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
								>
									<DropdownMenuLabel>Language</DropdownMenuLabel>
									<DropdownMenuSeparator />
									{directLanguageOptions.map((option) => {
										const Icon = option.icon ?? Globe;
										return (
											<DropdownMenuItem
												key={option.value}
												onClick={() => setSelectedLanguage(option.value)}
											>
												<Icon className="h-4 w-4" />
												<span>{option.label}</span>
												{selectedLanguage === option.value ? (
													<Check className="ml-auto h-4 w-4" />
												) : null}
											</DropdownMenuItem>
										);
									})}
									{directLanguageOptions.length > 0 &&
									availableLanguageGroups.length > 0 ? (
										<DropdownMenuSeparator />
									) : null}
									{availableLanguageGroups.map((group, index) => {
										const Icon = group.icon;
										return (
											<div key={group.id}>
												<DropdownMenuSub>
													<DropdownMenuSubTrigger>
														<Icon className="h-4 w-4" />
														<span>{group.label}</span>
													</DropdownMenuSubTrigger>
													<DropdownMenuSubContent>
														{group.options.map((option) => (
															<DropdownMenuItem
																key={option.value}
																onClick={() => setSelectedLanguage(option.value)}
															>
																<span>{option.label}</span>
																{selectedLanguage === option.value ? (
																	<Check className="ml-auto h-4 w-4" />
																) : null}
															</DropdownMenuItem>
														))}
													</DropdownMenuSubContent>
												</DropdownMenuSub>
												{index < availableLanguageGroups.length - 1 ? (
													<DropdownMenuSeparator />
												) : null}
											</div>
										);
									})}
								</DropdownMenuContent>
							</DropdownMenu>
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

				<EndpointRoutesTable
					endpointRoutes={endpointRoutes}
					selectedEndpoint={selectedEndpoint}
					showAllEndpointRoutes={showAllEndpointRoutes}
					onToggleShowAllEndpointRoutes={() =>
						setShowAllEndpointRoutes((current) => !current)
					}
					onSelectEndpoint={setSelectedEndpoint}
					compact={compactMode}
				/>

				<QuickstartUsageSection
					compactMode={compactMode}
					selectedLanguage={selectedLanguage}
					supportsStreaming={supportsStreaming}
					streamingEnabled={streamingEnabled}
					streamingDiff={streamingDiff}
					curlQuickstart={curlQuickstart}
					typescriptSdkUsage={typescriptSdkUsage}
					aiSdkUsage={aiSdkUsage}
					agentSdkTsUsage={agentSdkTsUsage}
					agentSdkPythonUsage={agentSdkPythonUsage}
					agentSdkGoUsage={agentSdkGoUsage}
					agentSdkCsharpUsage={agentSdkCsharpUsage}
					agentSdkPhpUsage={agentSdkPhpUsage}
					agentSdkRubyUsage={agentSdkRubyUsage}
					pythonSdkUsage={pythonSdkUsage}
					goSdkUsage={goSdkUsage}
					csharpSdkUsage={csharpSdkUsage}
					phpSdkUsage={phpSdkUsage}
					rubySdkUsage={rubySdkUsage}
					nodeFetchQuickstart={nodeFetchQuickstart}
					nodeFetchStreamingQuickstart={nodeFetchStreamingQuickstart}
					pythonRequestsQuickstart={pythonRequestsQuickstart}
					pythonRequestsStreamingQuickstart={pythonRequestsStreamingQuickstart}
					openaiPythonUsage={openaiPythonUsage}
					openaiNodeUsage={openaiNodeUsage}
					anthropicPythonUsage={anthropicPythonUsage}
					anthropicNodeUsage={anthropicNodeUsage}
				/>
			</div>
		</section>
	);
}
