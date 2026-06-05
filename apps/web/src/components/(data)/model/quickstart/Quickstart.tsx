// src/components/gateway/Quickstart.tsx
"use client";
import Link from "next/link";
import { KeyRound, Settings2, Shield, TerminalSquare } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BASE_URL } from "./config";
import { safeDecodeURIComponent } from "@/lib/utils/safe-decode";
import { capabilityToEndpoints } from "@/lib/config/capabilityToEndpoints";
import { resolveGatewayPath } from "./endpoint-paths";
import { EndpointRoutesTable } from "./EndpointRoutesTable";
import { QuickstartUsageSection } from "./QuickstartUsageSection";
import { buildEndpointRoutes, ENDPOINT_OPTIONS } from "./endpointRoutes";
import {
	AI_SDK_ENDPOINTS,
	AI_STATS_METHODS,
	LANGUAGE_OPTIONS,
	OPENAI_METHODS,
	STREAMING_PATHS,
	type LanguageOption,
} from "./quickstartSdkConfig";
import {
	applyRoutingPreferenceToPayload,
	buildExamplePayload,
	jsonToPythonLiteral,
	resolveRoutingPreference,
} from "./quickstartPayloads";
import { useEffect, useMemo, useState } from "react";
import type { QuickstartRequestContext } from "./requestContext";

interface QuickstartProps {
	modelId?: string;
	aliases?: string[];
	apiModelIds?: string[];
	primaryModelIdentifier?: string;
	acceptedModelIdentifiers?: string[];
	primaryModelIdentifierByEndpoint?: Record<string, string>;
	acceptedModelIdentifiersByEndpoint?: Record<string, string[]>;
	supportedParametersByEndpoint?: Record<
		string,
		Array<{
			param_id: string;
			provider_count_supported: number;
			provider_count_total: number;
			support_level: "all_providers" | "some_providers";
			providers: Array<{
				api_provider_id: string;
				api_provider_name: string;
				supported: boolean;
			}>;
		}>
	>;
	endpoint?: string | null;
	supportedEndpoints?: string[];
	showHeader?: boolean;
	requestContext?: QuickstartRequestContext;
}

const normalizeEndpointValue = (value: string | null | undefined) =>
	value ? value.toLowerCase().replace(/^\//, "").replace(/\//g, ".") : "";

const endpointValueFromPath = (path: string) => normalizeEndpointValue(path);

type LanguageFamilyId =
	| "curl"
	| "typescript"
	| "python"
	| "go"
	| "csharp"
	| "php"
	| "ruby";

type ServiceTier = "standard" | "priority" | "flex";

const LANGUAGE_FAMILY_ORDER: LanguageFamilyId[] = [
	"typescript",
	"python",
	"curl",
	"go",
	"csharp",
	"php",
	"ruby",
];

const LANGUAGE_DEFAULT_ORDER = [
	"typescript-sdk",
	"ai-sdk",
	"node-fetch",
	"python-sdk",
	"python-requests",
	"openai-node",
	"openai-python",
	"curl",
	"go-sdk",
	"csharp-sdk",
	"php-sdk",
	"ruby-sdk",
	"agent-sdk-ts",
	"agent-sdk-python",
	"agent-sdk-go",
	"agent-sdk-csharp",
	"agent-sdk-php",
	"agent-sdk-ruby",
	"anthropic-node",
	"anthropic-python",
] as const;

const LANGUAGE_FAMILY_META: Record<
	LanguageFamilyId,
	{ label: string; values: string[] }
> = {
	curl: { label: "cURL", values: ["curl"] },
	typescript: {
		label: "TypeScript",
		values: [
			"typescript-sdk",
			"agent-sdk-ts",
			"ai-sdk",
			"openai-node",
			"anthropic-node",
			"node-fetch",
		],
	},
	python: {
		label: "Python",
		values: [
			"python-sdk",
			"agent-sdk-python",
			"openai-python",
			"anthropic-python",
			"python-requests",
		],
	},
	go: { label: "Go", values: ["go-sdk", "agent-sdk-go"] },
	csharp: { label: "C#", values: ["csharp-sdk", "agent-sdk-csharp"] },
	php: { label: "PHP", values: ["php-sdk", "agent-sdk-php"] },
	ruby: { label: "Ruby", values: ["ruby-sdk", "agent-sdk-ruby"] },
};

const LANGUAGE_VARIANT_LABELS: Partial<Record<string, string>> = {
	curl: "HTTP",
	"ai-sdk": "Vercel AI SDK",
	"node-fetch": "Fetch",
	"python-requests": "Requests",
	"typescript-sdk": "SDK",
	"python-sdk": "SDK",
	"go-sdk": "SDK",
	"csharp-sdk": "SDK",
	"php-sdk": "SDK",
	"ruby-sdk": "SDK",
	"agent-sdk-ts": "Agent SDK",
	"agent-sdk-python": "Agent SDK",
	"agent-sdk-go": "Agent SDK",
	"agent-sdk-csharp": "Agent SDK",
	"agent-sdk-php": "Agent SDK",
	"agent-sdk-ruby": "Agent SDK",
	"openai-node": "OpenAI",
	"openai-python": "OpenAI",
	"anthropic-node": "Anthropic",
	"anthropic-python": "Anthropic",
};

const SERVICE_TIER_LABELS: Record<ServiceTier, string> = {
	standard: "Standard",
	priority: "Priority",
	flex: "Flex",
};
const STREAMING_SNIPPET_LANGUAGES = new Set([
	"curl",
	"node-fetch",
	"python-requests",
	"ai-sdk",
	"typescript-sdk",
	"python-sdk",
]);
const DOCS_BASE_URL = "https://docs.ai-stats.phaseo.app/v1";
const SERVICE_TIERS_DOCS_HREF = `${DOCS_BASE_URL}/guides/service-tiers`;
const STREAMING_DOCS_HREF = `${DOCS_BASE_URL}/guides/streaming`;
const ENDPOINT_DOCS_BY_VALUE: Partial<Record<string, { label: string; href: string }>> = {
	responses: {
		label: "Responses API",
		href: `${DOCS_BASE_URL}/api-reference/endpoint/responses`,
	},
	"chat.completions": {
		label: "Chat Completions API",
		href: `${DOCS_BASE_URL}/api-reference/endpoint/chat-completions`,
	},
	messages: {
		label: "Anthropic Messages API",
		href: `${DOCS_BASE_URL}/api-reference/endpoint/anthropic-messages`,
	},
};
const LANGUAGE_DOCS_BY_VALUE: Partial<Record<string, { label: string; href: string }>> = {
	"typescript-sdk": {
		label: "TypeScript SDK",
		href: `${DOCS_BASE_URL}/sdk-reference/typescript/overview`,
	},
	"python-sdk": {
		label: "Python SDK",
		href: `${DOCS_BASE_URL}/sdk-reference/python/overview`,
	},
	"go-sdk": {
		label: "Go SDK",
		href: `${DOCS_BASE_URL}/sdk-reference/go/overview`,
	},
	"csharp-sdk": {
		label: "C# SDK",
		href: `${DOCS_BASE_URL}/sdk-reference/csharp/overview`,
	},
	"php-sdk": {
		label: "PHP SDK",
		href: `${DOCS_BASE_URL}/sdk-reference/php/overview`,
	},
	"ruby-sdk": {
		label: "Ruby SDK",
		href: `${DOCS_BASE_URL}/sdk-reference/ruby/overview`,
	},
	"ai-sdk": {
		label: "Vercel AI SDK",
		href: `${DOCS_BASE_URL}/sdk-reference/sdk/ai-sdk`,
	},
	"agent-sdk-ts": {
		label: "TypeScript Agent SDK",
		href: `${DOCS_BASE_URL}/sdk-reference/typescript/agent-sdk-overview`,
	},
	"agent-sdk-python": {
		label: "Python Agent SDK",
		href: `${DOCS_BASE_URL}/sdk-reference/python/agent-sdk-overview`,
	},
	"agent-sdk-go": {
		label: "Go Agent SDK",
		href: `${DOCS_BASE_URL}/sdk-reference/go/agent-sdk-overview`,
	},
	"agent-sdk-csharp": {
		label: "C# Agent SDK",
		href: `${DOCS_BASE_URL}/sdk-reference/csharp/agent-sdk-overview`,
	},
	"agent-sdk-php": {
		label: "PHP Agent SDK",
		href: `${DOCS_BASE_URL}/sdk-reference/php/agent-sdk-overview`,
	},
	"agent-sdk-ruby": {
		label: "Ruby Agent SDK",
		href: `${DOCS_BASE_URL}/sdk-reference/ruby/agent-sdk-overview`,
	},
	"openai-node": {
		label: "OpenAI-compatible API",
		href: `${DOCS_BASE_URL}/api-reference/endpoint/chat-completions`,
	},
	"openai-python": {
		label: "OpenAI-compatible API",
		href: `${DOCS_BASE_URL}/api-reference/endpoint/chat-completions`,
	},
	"anthropic-node": {
		label: "Anthropic Messages API",
		href: `${DOCS_BASE_URL}/api-reference/endpoint/anthropic-messages`,
	},
	"anthropic-python": {
		label: "Anthropic Messages API",
		href: `${DOCS_BASE_URL}/api-reference/endpoint/anthropic-messages`,
	},
};

const getLanguageFamilyId = (language: string): LanguageFamilyId | null => {
	for (const familyId of LANGUAGE_FAMILY_ORDER) {
		if (LANGUAGE_FAMILY_META[familyId].values.includes(language)) {
			return familyId;
		}
	}
	return null;
};

const JSON_INDENT = 4;

const formatEmbeddedObject = (json: string, indentSize: number) => {
	const lines = json.split("\n");
	if (lines.length <= 2) return "";
	const indent = " ".repeat(indentSize);
	const baseIndent = " ".repeat(JSON_INDENT);
	return lines
		.slice(1, -1)
		.map((line) =>
			`${indent}${line.startsWith(baseIndent) ? line.slice(baseIndent.length) : line}`,
		)
		.join("\n");
};

export default function Quickstart({
	modelId,
	aliases,
	apiModelIds,
	primaryModelIdentifier,
	acceptedModelIdentifiers,
	primaryModelIdentifierByEndpoint,
	acceptedModelIdentifiersByEndpoint,
	supportedParametersByEndpoint,
	endpoint,
	supportedEndpoints = [],
	showHeader = true,
	requestContext,
}: QuickstartProps) {
	const supportedEndpointValues = useMemo(() => {
		const normalized = new Set(
			supportedEndpoints.map((value) => normalizeEndpointValue(value)),
		);
		const values = new Set<string>();
		for (const value of normalized) {
			const mapped = capabilityToEndpoints[value];
			if (mapped && mapped.length > 0) {
				mapped.forEach((path) => values.add(endpointValueFromPath(path)));
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
			supportedEndpointValues.has(option.value),
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
	const [selectedLanguage, setSelectedLanguage] = useState("typescript-sdk");
	const [selectedServiceTier, setSelectedServiceTier] =
		useState<ServiceTier>("standard");
	const batchEnabled = false;
	const [streamingEnabled, setStreamingEnabled] = useState(false);
	const [showAllEndpointRoutes, setShowAllEndpointRoutes] = useState(false);

	useEffect(() => {
		if (!availableEndpoints.some((e) => e.value === selectedEndpoint)) {
			setSelectedEndpoint(defaultEndpoint);
		}
	}, [availableEndpoints, defaultEndpoint, selectedEndpoint]);

	const quickstartEndpoint = batchEnabled ? "batch.create" : selectedEndpoint;

	const supportedLanguageSet = useMemo(() => {
		const normalizedEndpoint = normalizeEndpointValue(quickstartEndpoint);
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
		if (
			AI_STATS_METHODS[normalizedEndpoint] ||
			normalizedEndpoint === "messages"
		) {
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
	}, [quickstartEndpoint]);

	const availableLanguages = useMemo(
		() =>
			LANGUAGE_OPTIONS.filter((option) =>
				supportedLanguageSet.has(option.value),
			),
		[supportedLanguageSet],
	);

	const selectedLanguageOption = useMemo(
		() =>
			availableLanguages.find((option) => option.value === selectedLanguage) ??
			LANGUAGE_OPTIONS.find((option) => option.value === selectedLanguage) ??
			null,
		[availableLanguages, selectedLanguage],
	);

	const selectedEndpointOption = useMemo(
		() =>
			availableEndpoints.find((option) => option.value === selectedEndpoint) ??
			null,
		[availableEndpoints, selectedEndpoint],
	);
	const supportedParameters =
		supportedParametersByEndpoint?.[selectedEndpoint] ?? [];

	const supportsServiceTier = useMemo(() => {
		const normalized = normalizeEndpointValue(selectedEndpoint);
		return (
			normalized === "responses" ||
			normalized === "chat.completions" ||
			normalized === "messages"
		);
	}, [selectedEndpoint]);

	const availableLanguageFamilies = useMemo(
		() =>
			LANGUAGE_FAMILY_ORDER.map((familyId) => {
				const meta = LANGUAGE_FAMILY_META[familyId];
				const options = meta.values
					.map((value) =>
						availableLanguages.find((option) => option.value === value) ?? null,
					)
					.filter((option): option is LanguageOption => Boolean(option));
				return {
					id: familyId,
					label: meta.label,
					options,
				};
			}).filter((family) => family.options.length > 0),
		[availableLanguages],
	);

	const selectedLanguageFamily = useMemo(
		() =>
			availableLanguageFamilies.find((family) =>
				family.options.some((option) => option.value === selectedLanguage),
			) ?? availableLanguageFamilies[0] ?? null,
		[availableLanguageFamilies, selectedLanguage],
	);

	const secondaryLanguageOptions = selectedLanguageFamily?.options ?? [];

	useEffect(() => {
		if (!supportedLanguageSet.has(selectedLanguage)) {
			const selectedFamilyId = getLanguageFamilyId(selectedLanguage);
			const selectedVariantLabel =
				LANGUAGE_VARIANT_LABELS[selectedLanguage] ?? null;
			const familyFallback =
				selectedFamilyId
					? LANGUAGE_FAMILY_META[selectedFamilyId].values.find((value) =>
							supportedLanguageSet.has(value),
					  ) ?? null
					: null;
			const variantFallback = selectedVariantLabel
				? LANGUAGE_DEFAULT_ORDER.find(
						(value) =>
							supportedLanguageSet.has(value) &&
							(LANGUAGE_VARIANT_LABELS[value] ?? null) === selectedVariantLabel,
				  ) ?? null
				: null;
			const fallback =
				familyFallback ||
				variantFallback ||
				LANGUAGE_DEFAULT_ORDER.find((value) => supportedLanguageSet.has(value)) ||
				availableLanguages.find(
					(option) =>
						supportedLanguageSet.has(option.value) && !option.disabled,
				)?.value ||
				"curl";
			setSelectedLanguage(fallback);
		}
	}, [availableLanguages, selectedLanguage, supportedLanguageSet]);

	const supportsStreaming = useMemo(() => {
		if (batchEnabled) return false;
		if (!STREAMING_SNIPPET_LANGUAGES.has(selectedLanguage)) return false;
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
	}, [batchEnabled, selectedEndpoint, selectedLanguage]);

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
				safeDecodeURIComponent(identifier),
			) ?? []),
			...(endpointAcceptedIdentifiers.length === 0
				? [
						...(apiModelIds?.map((identifier) =>
							safeDecodeURIComponent(identifier),
						) ?? []),
						...(aliases?.map((alias) =>
							safeDecodeURIComponent(alias),
						) ?? []),
				  ]
				: []),
		]),
	).filter(Boolean);

	const decodedAliases = new Set(
		(aliases?.map((alias) => safeDecodeURIComponent(alias)) ?? []).filter(Boolean),
	);
	const canonicalAcceptedIdentifiers = decodedAcceptedIdentifiers.filter(
		(identifier) => !decodedAliases.has(identifier),
	);

	const model =
		safeDecodeURIComponent(endpointPrimaryModelIdentifier) ||
		canonicalAcceptedIdentifiers[0] ||
		safeDecodeURIComponent(modelId) ||
		decodedAcceptedIdentifiers[0] ||
		"model_id_here";
	const endpointPath = resolveGatewayPath(selectedEndpoint);
	const batchEndpointPath = resolveGatewayPath("batch.create");
	const activeEndpointPath = batchEnabled ? batchEndpointPath : endpointPath;
	const endpointUrl = `${BASE_URL}${activeEndpointPath}`;
	const routingPreference = resolveRoutingPreference(requestContext);
	const requestPayloadBase = applyRoutingPreferenceToPayload(
		buildExamplePayload(selectedEndpoint, model),
		routingPreference,
	);
	const requestPayload =
		supportsServiceTier && !batchEnabled
			? { ...requestPayloadBase, service_tier: selectedServiceTier }
			: requestPayloadBase;
	const batchLinePayload = supportsServiceTier
		? { ...requestPayloadBase, service_tier: selectedServiceTier }
		: requestPayloadBase;
	const batchPayload = {
		input_file_id: "file_abc123",
		endpoint: endpointPath,
		completion_window: "24h",
	};
	const payload = batchEnabled ? batchPayload : requestPayload;
	const payloadJson = JSON.stringify(payload, null, JSON_INDENT);
	const rawSdkPayloadJson = payloadJson;
	const payloadJsonStream = supportsStreaming
		? JSON.stringify({ ...requestPayload, stream: true }, null, JSON_INDENT)
		: payloadJson;
	const shouldStream = supportsStreaming && streamingEnabled;
	const activePayloadJson = shouldStream ? payloadJsonStream : payloadJson;
	const payloadObjectNode = formatEmbeddedObject(activePayloadJson, 4);
	const payloadJsonPython = jsonToPythonLiteral(activePayloadJson);
	const streamPayloadObjectNode = formatEmbeddedObject(payloadJsonStream, 4);
	const streamPayloadJsonPython = jsonToPythonLiteral(payloadJsonStream);
	const batchLineJson = JSON.stringify(
		{
			custom_id: "req_1",
			method: "POST",
			url: endpointPath,
			body: batchLinePayload,
		},
		null,
		JSON_INDENT,
	);
	const batchLineCommentTs = batchLineJson
		.split("\n")
		.map((line) => `// ${line}`)
		.join("\n");
	const batchLineCommentPy = batchLineJson
		.split("\n")
		.map((line) => `# ${line}`)
		.join("\n");
	const acceptedIdentifierList = Array.from(
		new Set([model, ...canonicalAcceptedIdentifiers, ...decodedAcceptedIdentifiers]),
	).filter(Boolean);

	const curlCommandLabel = batchEnabled
		? "Create a batch job"
		: shouldStream
			? "Send a streaming request"
			: "Send a request";
	const curlFlags = shouldStream ? "-N -s" : "-s";
	const curlQuickstart = `# 1) Set your key
export AI_STATS_API_KEY="aistats_***"

${batchEnabled ? `${batchLineCommentPy}

` : ""}# 2) ${curlCommandLabel}
curl ${curlFlags} ${endpointUrl} \\
-H "Authorization: Bearer $AI_STATS_API_KEY" \\
-H "Content-Type: application/json" \\
-d '${activePayloadJson}'`;

	const normalizedEndpoint = normalizeEndpointValue(quickstartEndpoint);
	const openaiMethod = OPENAI_METHODS[normalizedEndpoint];
	const aiSdkPrompt = (() => {
		const payloadValue = requestPayloadBase as Record<string, unknown>;
		const input = payloadValue.input;
		if (typeof input === "string") return input;
		const messages = payloadValue.messages as
			| Array<{ role?: string; content?: string }>
			| undefined;
		const userMessage = messages?.find(
			(message) =>
				message?.role === "user" &&
				typeof message?.content === "string",
		);
		return userMessage?.content ?? "Give me one fun fact about cURL.";
	})();
	const aiSdkPromptLiteral = JSON.stringify(aiSdkPrompt);

	const typescriptSdkUsage =
		normalizedEndpoint === "chat.completions"
			? shouldStream
				? `import AIStats from '@ai-stats/sdk';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
});

for await (const line of client.streamText({
${payloadObjectNode}
})) {
  process.stdout.write(line);
}`
				: `import AIStats from '@ai-stats/sdk';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
});

const response = await client.generateText({
${payloadObjectNode}
});

console.log(response.choices?.[0]?.message?.content ?? response);`
			: normalizedEndpoint === "messages"
				? shouldStream
					? `import AIStats from '@ai-stats/sdk';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
});

const stream = await client.messages.create({
${payloadObjectNode}
});

for await (const line of stream as AsyncGenerator<string>) {
  if (line === "data: [DONE]") break;
  process.stdout.write(line);
}`
					: `import AIStats from '@ai-stats/sdk';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
});

const response = await client.messages.create({
${payloadObjectNode}
});

const messageText = response.content
  ?.find((item) => item.type === "text")
  ?.text;

console.log(messageText ?? response);`
			: normalizedEndpoint === "responses"
				? shouldStream
					? `import AIStats from '@ai-stats/sdk';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
});

for await (const line of client.streamResponse({
${payloadObjectNode}
})) {
  process.stdout.write(line);
}`
					: `import AIStats from '@ai-stats/sdk';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
});

const response = await client.generateResponse({
${payloadObjectNode}
});

const outputText = response.output
  ?.flatMap((item) => item.content ?? [])
  .find((item) => item.type === "output_text")
  ?.text;

console.log(outputText ?? response);`
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

	const pythonSdkUsage =
		normalizedEndpoint === "chat.completions"
			? shouldStream
				? `import os
from ai_stats import AIStats

client = AIStats(api_key=os.environ.get("AI_STATS_API_KEY"))

payload = ${payloadJsonPython}

for line in client.stream_text(payload):
    print(line)`
				: `import os
from ai_stats import AIStats

client = AIStats(api_key=os.environ.get("AI_STATS_API_KEY"))

payload = ${payloadJsonPython}
response = client.generate_text(payload)

print(response.get("choices", [{}])[0].get("message", {}).get("content", response))`
			: normalizedEndpoint === "messages"
				? shouldStream
					? `import os
from ai_stats import AIStats

client = AIStats(api_key=os.environ.get("AI_STATS_API_KEY"))

payload = ${payloadJsonPython}
stream = client.messages.create(payload)

for line in stream:
    if line == "data: [DONE]":
        break
    print(line)`
					: `import os
from ai_stats import AIStats

client = AIStats(api_key=os.environ.get("AI_STATS_API_KEY"))

payload = ${payloadJsonPython}
response = client.messages.create(payload)

message_text = next(
    (
        item.get("text")
        for item in response.get("content", [])
        if item.get("type") == "text"
    ),
    None,
)

print(message_text or response)`
			: normalizedEndpoint === "responses"
				? shouldStream
					? `import os
from ai_stats import AIStats

client = AIStats(api_key=os.environ.get("AI_STATS_API_KEY"))

payload = ${payloadJsonPython}

for line in client.stream_response(payload):
    print(line)`
					: `import os
from ai_stats import AIStats

client = AIStats(api_key=os.environ.get("AI_STATS_API_KEY"))

payload = ${payloadJsonPython}
response = client.generate_response(payload)

output_text = next(
    (
        content_item.get("text")
        for item in response.get("output", [])
        for content_item in item.get("content", [])
        if content_item.get("type") == "output_text"
    ),
    None,
)

print(output_text or response)`
				: null;

	const goSdkUsage = normalizedEndpoint === "chat.completions"
		? `package main

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
  var payload aistats.ChatCompletionsRequest
  if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
    panic(err)
  }

  response, err := client.GenerateText(context.Background(), payload)
  if err != nil {
    panic(err)
  }

  formatted, err := json.MarshalIndent(response, "", "  ")
  if err != nil {
    panic(err)
  }

  fmt.Println(string(formatted))
}`
		: normalizedEndpoint === "responses"
			? `package main

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
  var payload aistats.ResponsesRequest
  if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
    panic(err)
  }

  response, err := client.GenerateResponse(context.Background(), payload)
  if err != nil {
    panic(err)
  }

  formatted, err := json.MarshalIndent(response, "", "  ")
  if err != nil {
    panic(err)
  }

  fmt.Println(string(formatted))
}`
			: `package main

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

  response, err := client.CreateAnthropicMessage(context.Background(), payload)
  if err != nil {
    panic(err)
  }

  formatted, err := json.MarshalIndent(response, "", "  ")
  if err != nil {
    panic(err)
  }

  fmt.Println(string(formatted))
}`;

	const csharpSdkUsage = `using System.Collections.Generic;
using System.Text.Json;
using AiStatsSdk;

var client = new AIStats();
var payload = JsonSerializer.Deserialize<Dictionary<string, object>>("""
${rawSdkPayloadJson}
""");

var response = await client.${
	normalizedEndpoint === "chat.completions"
		? "GenerateText"
		: normalizedEndpoint === "responses"
			? "GenerateResponse"
			: "CreateAnthropicMessage"
}(payload!);

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

$response = $client->${
	normalizedEndpoint === "chat.completions"
		? "generateText"
		: normalizedEndpoint === "responses"
			? "generateResponse"
			: "createAnthropicMessage"
}($payload);

echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;`;

	const rubySdkUsage = `require "json"
require "ai_stats_sdk"

client = AIStatsSdk::AIStats.new
payload = JSON.parse(<<~JSON)
${rawSdkPayloadJson}
JSON

response = client.${
	normalizedEndpoint === "chat.completions"
		? "generate_text"
		: normalizedEndpoint === "responses"
			? "generate_response"
			: "create_anthropic_message"
}(payload)

puts JSON.pretty_generate(response)`;

	const nodeFetchQuickstart = `// 1) Set your key
const apiKey = process.env.AI_STATS_API_KEY;

${batchEnabled ? `${batchLineCommentTs}

` : ""}// 2) ${curlCommandLabel}
const res = await fetch("${endpointUrl}", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${apiKey}\`,
    },
    body: JSON.stringify({
${payloadObjectNode}
    }),
});

if (!res.ok) {
  throw new Error(await res.text());
}

const data = await res.json();

${
	normalizedEndpoint === "responses"
		? `const outputText = data.output
  ?.flatMap((item) => item?.content ?? [])
  .find((item) => item?.type === "output_text")
  ?.text;

console.log(outputText ?? JSON.stringify(data, null, 2));`
		: normalizedEndpoint === "messages"
			? `const messageText = data.content
  ?.find((item) => item?.type === "text")
  ?.text;

console.log(messageText ?? JSON.stringify(data, null, 2));`
			: `console.log(
  data.choices?.[0]?.message?.content ?? JSON.stringify(data, null, 2),
);`
}`;

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
${streamPayloadObjectNode}
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

${batchEnabled ? `${batchLineCommentPy}

` : ""}# ${curlCommandLabel}
url = "${endpointUrl}"
payload = ${payloadJsonPython}

resp = requests.post(url, json=payload, headers={
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
})
resp.raise_for_status()

data = resp.json()

${
	normalizedEndpoint === "responses"
		? `output_text = next(
    (
        content_item.get("text")
        for item in data.get("output", [])
        for content_item in item.get("content", [])
        if content_item.get("type") == "output_text"
    ),
    None,
)

print(output_text or data)`
		: normalizedEndpoint === "messages"
			? `message_text = next(
    (
        item.get("text")
        for item in data.get("content", [])
        if item.get("type") == "text"
    ),
    None,
)

print(message_text or data)`
			: `print(data.get("choices", [])[0].get("message", {}).get("content") if data.get("choices") else data)`
}`;

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
${payloadObjectNode}
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
${payloadObjectNode}
});

console.log(response);`
			: null;
	const selectedLanguageLabel = selectedLanguageOption?.label ?? "Selected language";
	const selectedEndpointLabel =
		selectedEndpointOption?.label ?? "Selected endpoint";
	const selectedLanguageVariantLabel =
		LANGUAGE_VARIANT_LABELS[selectedLanguage] ?? selectedLanguageLabel;
	const serviceTierLabel = SERVICE_TIER_LABELS[selectedServiceTier];
	const docsLinks = Array.from(
		new Map(
			[
				LANGUAGE_DOCS_BY_VALUE[selectedLanguage] ?? null,
				ENDPOINT_DOCS_BY_VALUE[selectedEndpoint] ?? null,
				supportsServiceTier && selectedServiceTier !== "standard"
					? { label: "Service tiers", href: SERVICE_TIERS_DOCS_HREF }
					: null,
				shouldStream
					? { label: "Streaming", href: STREAMING_DOCS_HREF }
					: null,
			]
				.filter(
					(link): link is { label: string; href: string } => Boolean(link),
				)
				.map((link) => [link.href, link]),
		).values(),
	);
	const requestModeLabel = batchEnabled
		? `Batch request for ${selectedEndpointLabel}`
		: shouldStream
			? `${serviceTierLabel} tier · Streaming enabled`
			: supportsServiceTier
				? `${serviceTierLabel} tier`
				: "Standard request";

	return (
		<section className="space-y-6">
			{showHeader ? (
				<header className="space-y-1">
					<h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
						<TerminalSquare className="h-5 w-5 text-primary" />
						Quickstart
					</h2>
					<p className="text-sm text-muted-foreground">
						Create a key, choose a supported route, and copy a ready request.
					</p>
				</header>
			) : null}
			<div className="space-y-6">
				<div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
					<Badge
						variant="outline"
						className="w-fit self-start rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-[0.08em]"
					>
						Step 1
					</Badge>
					<div className="space-y-2">
						<h3 className="text-base font-semibold">Get an API key</h3>
						<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<span>Create an API key in</span>
							<Link
								href="/settings/keys"
								className="inline-flex items-center overflow-hidden rounded-lg border border-border/80 bg-background text-foreground shadow-xs transition-colors hover:bg-muted/40"
							>
								<span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs">
									<Settings2 className="h-3 w-3" />
									Settings
								</span>
								<span className="h-4 w-px bg-border/80" />
								<span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs">
									<KeyRound className="h-3 w-3" />
									Keys
								</span>
							</Link>
							<span>and store it as</span>
							<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
								AI_STATS_API_KEY
							</code>
						</div>
						<Alert className="border-amber-200 bg-amber-50 py-2 text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-50">
							<Shield className="h-4 w-4 text-amber-700 dark:text-amber-300" />
							<AlertTitle className="sr-only">Keep your API key secret</AlertTitle>
							<AlertDescription className="text-sm text-amber-900/90 dark:text-amber-100/90">
								Keep it server-side, never commit it, and rotate it immediately
								if exposed.
							</AlertDescription>
						</Alert>
					</div>
				</div>

				<div className="space-y-5 border-t border-border/70 pt-6">
					<div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
						<Badge
							variant="outline"
							className="w-fit self-start rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-[0.08em]"
						>
							Step 2
						</Badge>
						<div className="space-y-1">
							<h3 className="text-base font-semibold">Send the request</h3>
							<p className="text-sm text-muted-foreground">
								Choose a supported endpoint, pick a main language, then select
								the example style you want to copy.
							</p>
						</div>
					</div>

					<QuickstartUsageSection
						modelIdentifierInCode={model}
						acceptedIdentifiers={acceptedIdentifierList}
						supportedParameters={supportedParameters}
						selectedEndpointLabel={selectedEndpointLabel}
						selectedEndpointValue={selectedEndpoint}
						endpointOptions={availableEndpoints.map((option) => ({
							value: option.value,
							label: option.label,
						}))}
						selectedLanguage={selectedLanguage}
						selectedLanguageLabel={`${selectedLanguageFamily?.label ?? selectedLanguageLabel} · ${selectedLanguageVariantLabel}`}
						selectedLanguageFamilyId={selectedLanguageFamily?.id ?? "typescript"}
						availableLanguageFamilies={availableLanguageFamilies}
						secondaryLanguageOptions={secondaryLanguageOptions}
						supportsStreaming={supportsStreaming}
						supportsServiceTier={supportsServiceTier}
						streamingEnabled={streamingEnabled}
						selectedServiceTier={selectedServiceTier}
						docsLinks={docsLinks}
						requestModeLabel={requestModeLabel}
						serviceTierDocsHref={supportsServiceTier ? SERVICE_TIERS_DOCS_HREF : null}
						streamingDocsHref={shouldStream ? STREAMING_DOCS_HREF : null}
						onSelectEndpoint={setSelectedEndpoint}
						onSelectLanguageFamily={(familyId) => {
							const family = availableLanguageFamilies.find(
								(candidate) => candidate.id === familyId,
							);
							if (family) {
								setSelectedLanguage(family.options[0].value);
							}
						}}
						onSelectLanguage={setSelectedLanguage}
						onSelectServiceTier={setSelectedServiceTier}
						onToggleStreaming={setStreamingEnabled}
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

					{false ? <QuickstartUsageSection
						modelIdentifierInCode={model}
						acceptedIdentifiers={acceptedIdentifierList}
						supportedParameters={supportedParameters}
						selectedEndpointLabel={selectedEndpointLabel}
						selectedEndpointValue={selectedEndpoint}
						endpointOptions={availableEndpoints.map((option) => ({
							value: option.value,
							label: option.label,
						}))}
						selectedLanguage={selectedLanguage}
						selectedLanguageLabel={`${selectedLanguageFamily?.label ?? selectedLanguageLabel} · ${selectedLanguageVariantLabel}`}
						selectedLanguageFamilyId={selectedLanguageFamily?.id ?? "typescript"}
						availableLanguageFamilies={availableLanguageFamilies}
						secondaryLanguageOptions={secondaryLanguageOptions}
						supportsStreaming={supportsStreaming}
						supportsServiceTier={supportsServiceTier}
						streamingEnabled={streamingEnabled}
						selectedServiceTier={selectedServiceTier}
						docsLinks={docsLinks}
						requestModeLabel={requestModeLabel}
						serviceTierDocsHref={supportsServiceTier ? SERVICE_TIERS_DOCS_HREF : null}
						streamingDocsHref={shouldStream ? STREAMING_DOCS_HREF : null}
						onSelectEndpoint={setSelectedEndpoint}
						onSelectLanguageFamily={(familyId) => {
							const family = availableLanguageFamilies.find(
								(candidate) => candidate.id === familyId,
							);
							if (family) {
								setSelectedLanguage(family.options[0].value);
							}
						}}
						onSelectLanguage={setSelectedLanguage}
						onSelectServiceTier={setSelectedServiceTier}
						onToggleStreaming={setStreamingEnabled}
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
					/> : null}

					<EndpointRoutesTable
						endpointRoutes={endpointRoutes}
						selectedEndpoint={selectedEndpoint}
						showAllEndpointRoutes={showAllEndpointRoutes}
						onToggleShowAllEndpointRoutes={() =>
							setShowAllEndpointRoutes((current) => !current)
						}
						onSelectEndpoint={setSelectedEndpoint}
					/>

					{false ? <QuickstartUsageSection
						modelIdentifierInCode={model}
						acceptedIdentifiers={acceptedIdentifierList}
						supportedParameters={supportedParameters}
						selectedEndpointLabel={selectedEndpointLabel}
						selectedEndpointValue={selectedEndpoint}
						endpointOptions={availableEndpoints.map((option) => ({
							value: option.value,
							label: option.label,
						}))}
						selectedLanguage={selectedLanguage}
						selectedLanguageFamilyId={selectedLanguageFamily?.id ?? "typescript"}
						availableLanguageFamilies={availableLanguageFamilies}
						secondaryLanguageOptions={secondaryLanguageOptions}
						selectedLanguageLabel={`${selectedLanguageFamily?.label ?? selectedLanguageLabel} · ${selectedLanguageVariantLabel}`}
						supportsStreaming={supportsStreaming}
						supportsServiceTier={supportsServiceTier}
						streamingEnabled={streamingEnabled}
						selectedServiceTier={selectedServiceTier}
						docsLinks={docsLinks}
						requestModeLabel={requestModeLabel}
						serviceTierDocsHref={supportsServiceTier ? SERVICE_TIERS_DOCS_HREF : null}
						streamingDocsHref={shouldStream ? STREAMING_DOCS_HREF : null}
						onSelectEndpoint={setSelectedEndpoint}
						onSelectLanguageFamily={(familyId) => {
							const family = availableLanguageFamilies.find(
								(candidate) => candidate.id === familyId,
							);
							if (family) {
								setSelectedLanguage(family.options[0].value);
							}
						}}
						onSelectLanguage={setSelectedLanguage}
						onSelectServiceTier={setSelectedServiceTier}
						onToggleStreaming={setStreamingEnabled}
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
					/> : null}
				</div>
			</div>
		</section>
	);
}
