"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import CodeBlock from "@/components/(data)/model/quickstart/CodeBlock";
import type { ShikiLang } from "@/components/(data)/model/quickstart/shiki";
import { BASE_URL } from "@/components/(data)/model/quickstart/config";
import { cn } from "@/lib/utils";

type SourceId =
	| "openai-sdk"
	| "anthropic-sdk"
	| "openrouter"
	| "vercel-ai"
	| "openai-compatible"
	| "getting-started";

type PathId =
	| "ts-openai"
	| "py-openai"
	| "ts-anthropic"
	| "py-anthropic"
	| "rest"
	| "ts-sdk"
	| "py-sdk"
	| "vercel-ai-sdk";

type Step = {
	title: string;
	description: string;
};

type Snippet = {
	label: string;
	lang: ShikiLang;
	code: string;
};

type PathOption = {
	id: PathId;
	label: string;
	description: string;
	steps: Step[];
	snippet: Snippet;
};

type Flow = {
	prompt: string;
	options: PathOption[];
};

type DiffView = "split" | "diff";
type ChangeNote = {
	title: string;
	description: string;
};

const SOURCE_OPTIONS: Array<{
	id: SourceId;
	label: string;
	description: string;
}> = [
	{
		id: "openai-sdk",
		label: "OpenAI SDK",
		description: "Using the official OpenAI SDKs today.",
	},
	{
		id: "anthropic-sdk",
		label: "Anthropic SDK",
		description: "Using the Anthropic client libraries.",
	},
	{
		id: "openrouter",
		label: "OpenRouter",
		description: "Routing requests through OpenRouter.",
	},
	{
		id: "vercel-ai",
		label: "Vercel AI Gateway",
		description: "Using Vercel AI Gateway or the AI SDK provider stack.",
	},
	{
		id: "openai-compatible",
		label: "OpenAI Compatible Libraries",
		description: "Any OpenAI-style SDK or REST integration.",
	},
	{
		id: "getting-started",
		label: "Just getting started",
		description: "Set up from scratch with the fastest path.",
	},
];

const SOURCE_LOGOS: Partial<Record<SourceId, string>> = {
	"openai-sdk": "openai",
	"anthropic-sdk": "anthropic",
	openrouter: "openrouter",
	"vercel-ai": "vercel",
	"openai-compatible": "openai",
};

const DOC_LINKS = [
	{
		label: "API Reference",
		description: "Endpoints, auth, and error formats.",
		href: "https://docs.ai-stats.phaseo.app/v1/api-reference/introduction",
	},
	{
		label: "Quickstart",
		description: "Make your first Gateway call in minutes.",
		href: "https://docs.ai-stats.phaseo.app/v1/quickstart",
	},
	{
		label: "Tool Calling",
		description: "Tools, tool_choice, and function routing.",
		href: "https://docs.ai-stats.phaseo.app/v1/guides/tool-calling",
	},
	{
		label: "Structured Outputs",
		description: "Schema-locked responses with constraints.",
		href: "https://docs.ai-stats.phaseo.app/v1/guides/structured-outputs",
	},
] as const;

const SHARED_STEPS = {
	key: {
		title: "Use your AI Stats API key",
		description:
			"Create a key in the AI Stats dashboard and store it as AI_STATS_API_KEY.",
	},
	baseUrl: {
		title: "Point the base URL to AI Stats",
		description: `Set the base URL to ${BASE_URL}.`,
	},
	payload: {
		title: "Keep your payloads the same",
		description:
			"Your model selection and message payloads remain unchanged.",
	},
	headers: {
		title: "Send the Authorization header",
		description: "Add Authorization: Bearer <key> on every request.",
	},
};

const SNIPPETS: Record<PathId, Snippet> = {
	"ts-openai": {
		label: "OpenAI SDK (TypeScript)",
		lang: "ts",
		code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AI_STATS_API_KEY ?? "YOUR_API_KEY",
  baseURL: "${BASE_URL}",
});

const response = await client.chat.completions.create({
  model: "openai/gpt-4.1-mini",
  messages: [{ role: "user", content: "Ship a migration checklist." }],
});

console.log(response);`,
	},
	"py-openai": {
		label: "OpenAI SDK (Python)",
		lang: "python",
		code: `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv("AI_STATS_API_KEY", "YOUR_API_KEY"),
    base_url="${BASE_URL}",
)

response = client.chat.completions.create(
    model="openai/gpt-4.1-mini",
    messages=[{"role": "user", "content": "Ship a migration checklist."}],
)

print(response)`,
	},
	"ts-anthropic": {
		label: "Anthropic SDK (TypeScript)",
		lang: "ts",
		code: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.AI_STATS_API_KEY ?? "YOUR_API_KEY",
  baseURL: "${BASE_URL}",
});

const response = await client.messages.create({
  model: "anthropic/claude-3.5-sonnet",
  max_tokens: 512,
  messages: [{ role: "user", content: "Ship a migration checklist." }],
});

console.log(response);`,
	},
	"py-anthropic": {
		label: "Anthropic SDK (Python)",
		lang: "python",
		code: `from anthropic import Anthropic
import os

client = Anthropic(
    api_key=os.getenv("AI_STATS_API_KEY", "YOUR_API_KEY"),
    base_url="${BASE_URL}",
)

response = client.messages.create(
    model="anthropic/claude-3.5-sonnet",
    max_tokens=512,
    messages=[{"role": "user", "content": "Ship a migration checklist."}],
)

print(response)`,
	},
	rest: {
		label: "REST (cURL)",
		lang: "bash",
		code: `curl -s "${BASE_URL}/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "openai/gpt-4.1-mini",
    "messages": [
      { "role": "user", "content": "Ship a migration checklist." }
    ]
  }'`,
	},
	"ts-sdk": {
		label: "AI Stats SDK (TypeScript)",
		lang: "ts",
		code: `import { AIStats } from "@ai-stats/ts-sdk";

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY ?? "YOUR_API_KEY",
});

const response = await client.chatCompletions({
  model: "openai/gpt-4.1-mini",
  messages: [{ role: "user", content: "Ship a migration checklist." }],
});

console.log(response);`,
	},
	"py-sdk": {
		label: "AI Stats SDK (Python)",
		lang: "python",
		code: `from ai_stats import AIStats
import asyncio

async def main():
    async with AIStats(api_key="YOUR_API_KEY") as client:
        response = await client.chat_completions(
            model="openai/gpt-4.1-mini",
            messages=[{"role": "user", "content": "Ship a migration checklist."}],
        )
        print(response)

asyncio.run(main())`,
	},
	"vercel-ai-sdk": {
		label: "Vercel AI SDK",
		lang: "ts",
		code: `import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  apiKey: process.env.AI_STATS_API_KEY ?? "YOUR_API_KEY",
  baseURL: "${BASE_URL}",
});

const { text } = await generateText({
  model: openai("openai/gpt-4.1-mini"),
  prompt: "Ship a migration checklist.",
});

console.log(text);`,
	},
};

const BEFORE_SNIPPETS: Record<PathId, Snippet> = {
	"ts-openai": {
		label: "Before (OpenAI SDK)",
		lang: "ts",
		code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "YOUR_OPENAI_KEY",
});

const response = await client.chat.completions.create({
  model: "gpt-4.1-mini",
  messages: [{ role: "user", content: "Ship a migration checklist." }],
});

console.log(response);`,
	},
	"py-openai": {
		label: "Before (OpenAI SDK)",
		lang: "python",
		code: `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY", "YOUR_OPENAI_KEY"),
)

response = client.chat.completions.create(
    model="gpt-4.1-mini",
    messages=[{"role": "user", "content": "Ship a migration checklist."}],
)

print(response)`,
	},
	"ts-anthropic": {
		label: "Before (Anthropic SDK)",
		lang: "ts",
		code: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "YOUR_ANTHROPIC_KEY",
});

const response = await client.messages.create({
  model: "claude-3.5-sonnet",
  max_tokens: 512,
  messages: [{ role: "user", content: "Ship a migration checklist." }],
});

console.log(response);`,
	},
	"py-anthropic": {
		label: "Before (Anthropic SDK)",
		lang: "python",
		code: `from anthropic import Anthropic
import os

client = Anthropic(
    api_key=os.getenv("ANTHROPIC_API_KEY", "YOUR_ANTHROPIC_KEY"),
)

response = client.messages.create(
    model="claude-3.5-sonnet",
    max_tokens=512,
    messages=[{"role": "user", "content": "Ship a migration checklist."}],
)

print(response)`,
	},
	rest: {
		label: "Before (OpenAI REST)",
		lang: "bash",
		code: `curl -s "https://api.openai.com/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -d '{
    "model": "gpt-4.1-mini",
    "messages": [
      { "role": "user", "content": "Ship a migration checklist." }
    ]
  }'`,
	},
	"ts-sdk": {
		label: "Before (No SDK configured)",
		lang: "ts",
		code: `// No AI Stats client configured yet.`,
	},
	"py-sdk": {
		label: "Before (No SDK configured)",
		lang: "python",
		code: `# No AI Stats client configured yet.`,
	},
	"vercel-ai-sdk": {
		label: "Before (Vercel AI SDK)",
		lang: "ts",
		code: `import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "YOUR_OPENAI_KEY",
});

const { text } = await generateText({
  model: openai("gpt-4.1-mini"),
  prompt: "Ship a migration checklist.",
});

console.log(text);`,
	},
};

const BEFORE_SNIPPETS_OPENROUTER: Partial<Record<PathId, Snippet>> = {
	"ts-openai": {
		label: "Before (OpenRouter + OpenAI SDK)",
		lang: "ts",
		code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "YOUR_OPENROUTER_KEY",
  baseURL: "https://openrouter.ai/api/v1",
});

const response = await client.chat.completions.create({
  model: "openai/gpt-4.1-mini",
  messages: [{ role: "user", content: "Ship a migration checklist." }],
});

console.log(response);`,
	},
	rest: {
		label: "Before (OpenRouter REST)",
		lang: "bash",
		code: `curl -s "https://openrouter.ai/api/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \\
  -d '{
    "model": "openai/gpt-4.1-mini",
    "messages": [
      { "role": "user", "content": "Ship a migration checklist." }
    ]
  }'`,
	},
};

const DIFF_SNIPPETS: Record<PathId, Snippet> = {
	"ts-openai": {
		label: "Diff",
		lang: "diff",
		code: ` import OpenAI from "openai";

 const client = new OpenAI({
-  apiKey: process.env.OPENAI_API_KEY ?? "YOUR_OPENAI_KEY",
+  apiKey: process.env.AI_STATS_API_KEY ?? "YOUR_API_KEY",
+  baseURL: "${BASE_URL}",
 });

 const response = await client.chat.completions.create({
-  model: "gpt-4.1-mini",
+  model: "openai/gpt-4.1-mini",
   messages: [{ role: "user", content: "Ship a migration checklist." }],
 });
`,
	},
	"py-openai": {
		label: "Diff",
		lang: "diff",
		code: ` from openai import OpenAI
 import os

-client = OpenAI(
-    api_key=os.getenv("OPENAI_API_KEY", "YOUR_OPENAI_KEY"),
-)
+client = OpenAI(
+    api_key=os.getenv("AI_STATS_API_KEY", "YOUR_API_KEY"),
+    base_url="${BASE_URL}",
+)

 response = client.chat.completions.create(
-    model="gpt-4.1-mini",
+    model="openai/gpt-4.1-mini",
     messages=[{"role": "user", "content": "Ship a migration checklist."}],
 )
`,
	},
	"ts-anthropic": {
		label: "Diff",
		lang: "diff",
		code: ` import Anthropic from "@anthropic-ai/sdk";

 const client = new Anthropic({
-  apiKey: process.env.ANTHROPIC_API_KEY ?? "YOUR_ANTHROPIC_KEY",
+  apiKey: process.env.AI_STATS_API_KEY ?? "YOUR_API_KEY",
+  baseURL: "${BASE_URL}",
 });

 const response = await client.messages.create({
-  model: "claude-3.5-sonnet",
+  model: "anthropic/claude-3.5-sonnet",
   max_tokens: 512,
   messages: [{ role: "user", content: "Ship a migration checklist." }],
 });
`,
	},
	"py-anthropic": {
		label: "Diff",
		lang: "diff",
		code: ` from anthropic import Anthropic
 import os

-client = Anthropic(
-    api_key=os.getenv("ANTHROPIC_API_KEY", "YOUR_ANTHROPIC_KEY"),
-)
+client = Anthropic(
+    api_key=os.getenv("AI_STATS_API_KEY", "YOUR_API_KEY"),
+    base_url="${BASE_URL}",
+)

 response = client.messages.create(
-    model="claude-3.5-sonnet",
+    model="anthropic/claude-3.5-sonnet",
     max_tokens=512,
     messages=[{"role": "user", "content": "Ship a migration checklist."}],
 )
`,
	},
	rest: {
		label: "Diff",
		lang: "diff",
		code: `-curl -s "https://api.openai.com/v1/chat/completions" \\
-  -H "Authorization: Bearer $OPENAI_API_KEY" \\
+curl -s "${BASE_URL}/chat/completions" \\
+  -H "Authorization: Bearer YOUR_API_KEY" \\
   -H "Content-Type: application/json" \\
   -d '{
-    "model": "gpt-4.1-mini",
+    "model": "openai/gpt-4.1-mini",
     "messages": [
       { "role": "user", "content": "Ship a migration checklist." }
     ]
   }'`,
	},
	"ts-sdk": {
		label: "Diff",
		lang: "diff",
		code: `-// No AI Stats client configured yet.
+import { AIStats } from "@ai-stats/ts-sdk";
+
+const client = new AIStats({
+  apiKey: process.env.AI_STATS_API_KEY ?? "YOUR_API_KEY",
+});
+
+const response = await client.chatCompletions({
+  model: "openai/gpt-4.1-mini",
+  messages: [{ role: "user", content: "Ship a migration checklist." }],
+});
+
+console.log(response);`,
	},
	"py-sdk": {
		label: "Diff",
		lang: "diff",
		code: `-# No AI Stats client configured yet.
+from ai_stats import AIStats
+import asyncio
+
+async def main():
+    async with AIStats(api_key="YOUR_API_KEY") as client:
+        response = await client.chat_completions(
+            model="openai/gpt-4.1-mini",
+            messages=[{"role": "user", "content": "Ship a migration checklist."}],
+        )
+        print(response)
+
+asyncio.run(main())`,
	},
	"vercel-ai-sdk": {
		label: "Diff",
		lang: "diff",
		code: ` import { generateText } from "ai";
 import { createOpenAI } from "@ai-sdk/openai";

 const openai = createOpenAI({
-  apiKey: process.env.OPENAI_API_KEY ?? "YOUR_OPENAI_KEY",
+  apiKey: process.env.AI_STATS_API_KEY ?? "YOUR_API_KEY",
+  baseURL: "${BASE_URL}",
 });

 const { text } = await generateText({
-  model: openai("gpt-4.1-mini"),
+  model: openai("openai/gpt-4.1-mini"),
   prompt: "Ship a migration checklist.",
 });
`,
	},
};

const DIFF_SNIPPETS_OPENROUTER: Partial<Record<PathId, Snippet>> = {
	"ts-openai": {
		label: "Diff",
		lang: "diff",
		code: ` import OpenAI from "openai";

 const client = new OpenAI({
-  apiKey: process.env.OPENROUTER_API_KEY ?? "YOUR_OPENROUTER_KEY",
-  baseURL: "https://openrouter.ai/api/v1",
+  apiKey: process.env.AI_STATS_API_KEY ?? "YOUR_API_KEY",
+  baseURL: "${BASE_URL}",
 });

 const response = await client.chat.completions.create({
   model: "openai/gpt-4.1-mini",
   messages: [{ role: "user", content: "Ship a migration checklist." }],
 });
`,
	},
	rest: {
		label: "Diff",
		lang: "diff",
		code: `-curl -s "https://openrouter.ai/api/v1/chat/completions" \\
-  -H "Authorization: Bearer $OPENROUTER_API_KEY" \\
+curl -s "${BASE_URL}/chat/completions" \\
+  -H "Authorization: Bearer YOUR_API_KEY" \\
   -H "Content-Type: application/json" \\
   -d '{
     "model": "openai/gpt-4.1-mini",
     "messages": [
       { "role": "user", "content": "Ship a migration checklist." }
     ]
   }'`,
	},
};

const getBeforeSnippet = (source: SourceId, pathId: PathId) => {
	if (source === "openrouter") {
		const override = BEFORE_SNIPPETS_OPENROUTER[pathId];
		if (override) {
			return override;
		}
	}

	return BEFORE_SNIPPETS[pathId];
};

const getDiffSnippet = (source: SourceId, pathId: PathId) => {
	if (source === "openrouter") {
		const override = DIFF_SNIPPETS_OPENROUTER[pathId];
		if (override) {
			return override;
		}
	}

	return DIFF_SNIPPETS[pathId];
};

const CHANGE_NOTES: Record<PathId, ChangeNote[]> = {
	"ts-openai": [
		{
			title: "Use your AI Stats Gateway key",
			description:
				"Replace OPENAI_API_KEY with AI_STATS_API_KEY from the AI Stats dashboard.",
		},
		{
			title: "Route requests through AI Stats",
			description: `Set baseURL to ${BASE_URL} so traffic goes through the Gateway.`,
		},
		{
			title: "Update model ids",
			description:
				"Use AI Stats model ids like openai/gpt-4.1-mini. Find them on each model quickstart page.",
		},
	],
	"py-openai": [
		{
			title: "Use your AI Stats Gateway key",
			description:
				"Replace OPENAI_API_KEY with AI_STATS_API_KEY from the AI Stats dashboard.",
		},
		{
			title: "Route requests through AI Stats",
			description: `Set base_url to ${BASE_URL} so traffic goes through the Gateway.`,
		},
		{
			title: "Update model ids",
			description:
				"Use AI Stats model ids like openai/gpt-4.1-mini. Find them on each model quickstart page.",
		},
	],
	"ts-anthropic": [
		{
			title: "Use your AI Stats Gateway key",
			description:
				"Replace ANTHROPIC_API_KEY with AI_STATS_API_KEY from the AI Stats dashboard.",
		},
		{
			title: "Route requests through AI Stats",
			description: `Set baseURL to ${BASE_URL} so traffic goes through the Gateway.`,
		},
		{
			title: "Update model ids",
			description:
				"Use AI Stats model ids like anthropic/claude-3.5-sonnet. Find them on each model quickstart page.",
		},
	],
	"py-anthropic": [
		{
			title: "Use your AI Stats Gateway key",
			description:
				"Replace ANTHROPIC_API_KEY with AI_STATS_API_KEY from the AI Stats dashboard.",
		},
		{
			title: "Route requests through AI Stats",
			description: `Set base_url to ${BASE_URL} so traffic goes through the Gateway.`,
		},
		{
			title: "Update model ids",
			description:
				"Use AI Stats model ids like anthropic/claude-3.5-sonnet. Find them on each model quickstart page.",
		},
	],
	rest: [
		{
			title: "Use your AI Stats Gateway key",
			description: "Send Authorization: Bearer YOUR_API_KEY on every request.",
		},
		{
			title: "Route requests through AI Stats",
			description: `Send requests to ${BASE_URL}/chat/completions.`,
		},
		{
			title: "Update model ids",
			description:
				"Use AI Stats model ids like openai/gpt-4.1-mini. Find them on each model quickstart page.",
		},
	],
	"ts-sdk": [
		{
			title: "Use your AI Stats Gateway key",
			description:
				"Set AI_STATS_API_KEY from the AI Stats dashboard for the SDK client.",
		},
		{
			title: "Update model ids",
			description:
				"Use AI Stats model ids like openai/gpt-4.1-mini. Find them on each model quickstart page.",
		},
	],
	"py-sdk": [
		{
			title: "Use your AI Stats Gateway key",
			description:
				"Set AI_STATS_API_KEY from the AI Stats dashboard for the SDK client.",
		},
		{
			title: "Update model ids",
			description:
				"Use AI Stats model ids like openai/gpt-4.1-mini. Find them on each model quickstart page.",
		},
	],
	"vercel-ai-sdk": [
		{
			title: "Use your AI Stats Gateway key",
			description:
				"Replace OPENAI_API_KEY with AI_STATS_API_KEY from the AI Stats dashboard.",
		},
		{
			title: "Route requests through AI Stats",
			description: `Set baseURL to ${BASE_URL} so traffic goes through the Gateway.`,
		},
		{
			title: "Update model ids",
			description:
				"Use AI Stats model ids like openai/gpt-4.1-mini. Find them on each model quickstart page.",
		},
	],
};

const FLOWS: Record<SourceId, Flow> = {
	"openai-sdk": {
		prompt: "Which OpenAI SDK are you using?",
		options: [
			{
				id: "ts-openai",
				label: "TypeScript / Node",
				description: "Keep the OpenAI client and swap the base URL.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS["ts-openai"],
			},
			{
				id: "py-openai",
				label: "Python",
				description: "Point the Python SDK to AI Stats.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS["py-openai"],
			},
			{
				id: "rest",
				label: "REST",
				description: "Switch your REST calls to the Gateway.",
				steps: [SHARED_STEPS.headers, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS.rest,
			},
		],
	},
	"anthropic-sdk": {
		prompt: "Which Anthropic SDK are you using?",
		options: [
			{
				id: "ts-anthropic",
				label: "TypeScript / Node",
				description: "Keep the Anthropic client and swap the base URL.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS["ts-anthropic"],
			},
			{
				id: "py-anthropic",
				label: "Python",
				description: "Point the Python SDK to AI Stats.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS["py-anthropic"],
			},
			{
				id: "rest",
				label: "REST",
				description: "Switch your REST calls to the Gateway.",
				steps: [SHARED_STEPS.headers, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS.rest,
			},
		],
	},
	openrouter: {
		prompt: "How do you call OpenRouter today?",
		options: [
			{
				id: "ts-openai",
				label: "OpenAI-compatible SDK",
				description: "Keep the OpenAI client and swap the base URL.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS["ts-openai"],
			},
			{
				id: "rest",
				label: "REST",
				description: "Switch your REST calls to the Gateway.",
				steps: [SHARED_STEPS.headers, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS.rest,
			},
		],
	},
	"vercel-ai": {
		prompt: "How are you integrated with Vercel today?",
		options: [
			{
				id: "vercel-ai-sdk",
				label: "Vercel AI SDK",
				description: "Swap the OpenAI provider base URL.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS["vercel-ai-sdk"],
			},
			{
				id: "rest",
				label: "REST API",
				description: "Use REST calls in any runtime.",
				steps: [SHARED_STEPS.headers, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS.rest,
			},
		],
	},
	"openai-compatible": {
		prompt: "Choose your environment.",
		options: [
			{
				id: "ts-openai",
				label: "TypeScript / Node",
				description: "Use OpenAI SDK-compatible configuration.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS["ts-openai"],
			},
			{
				id: "py-openai",
				label: "Python",
				description: "Use the OpenAI Python client with AI Stats.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS["py-openai"],
			},
			{
				id: "rest",
				label: "REST",
				description: "Call the Gateway directly.",
				steps: [SHARED_STEPS.headers, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS.rest,
			},
		],
	},
	"getting-started": {
		prompt: "Pick your preferred integration.",
		options: [
			{
				id: "ts-sdk",
				label: "AI Stats SDK (TypeScript)",
				description: "Full typed client with helpers.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.payload],
				snippet: SNIPPETS["ts-sdk"],
			},
			{
				id: "py-sdk",
				label: "AI Stats SDK (Python)",
				description: "Async-first Python client.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.payload],
				snippet: SNIPPETS["py-sdk"],
			},
			{
				id: "rest",
				label: "REST",
				description: "Fastest way to send a request.",
				steps: [SHARED_STEPS.headers, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS.rest,
			},
		],
	},
};

function OptionCard({
	label,
	description,
	logoId,
	icon,
	active,
	onClick,
}: {
	label: string;
	description: string;
	logoId?: string;
	icon?: ReactNode;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"w-full text-left rounded-xl border px-4 py-3 transition",
				active
					? "border-primary/60 bg-primary/5 shadow-sm"
					: "border-border/60 hover:border-primary/40 hover:bg-muted/40"
			)}
		>
			<div className="flex items-start gap-3">
				{logoId ? (
					<span className="h-9 w-9 rounded-xl border border-border/60 flex items-center justify-center">
						<span className="relative h-5 w-5">
							<Logo id={logoId} alt={label} fill className="object-contain" />
						</span>
					</span>
				) : icon ? (
					<span className="h-9 w-9 rounded-xl border border-border/60 flex items-center justify-center text-muted-foreground">
						{icon}
					</span>
				) : null}
				<div>
					<p className="text-sm font-semibold">{label}</p>
					<p className="text-xs text-muted-foreground">{description}</p>
				</div>
			</div>
		</button>
	);
}

export function MigrationGuide() {
	const [source, setSource] = useState<SourceId | null>(null);
	const flow = useMemo(() => (source ? FLOWS[source] : null), [source]);
	const [pathId, setPathId] = useState<PathId | null>(null);
	const [diffView, setDiffView] = useState<DiffView>("split");

	useEffect(() => {
		setPathId(null);
	}, [source]);

	const selectedOption = flow?.options.find((option) => option.id === pathId);
	const beforeSnippet =
		source && selectedOption
			? getBeforeSnippet(source, selectedOption.id)
			: null;
	const diffSnippet =
		source && selectedOption
			? getDiffSnippet(source, selectedOption.id)
			: null;
	const changeNotes = selectedOption ? CHANGE_NOTES[selectedOption.id] ?? [] : [];

	return (
		<div className="space-y-10">
			<div className="grid gap-10 lg:grid-cols-2">
				<section className="space-y-4">
					<div className="space-y-2">
						<p className="text-xs uppercase tracking-wide text-muted-foreground">
							Step 1
						</p>
						<h2 className="text-2xl font-semibold">
							Where are you migrating from?
						</h2>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						{SOURCE_OPTIONS.map((option) => {
							const logoId = SOURCE_LOGOS[option.id];
							const icon =
								option.id === "getting-started" ? (
									<Sparkles className="h-4 w-4" />
								) : null;
							return (
								<OptionCard
									key={option.id}
									label={option.label}
									description={option.description}
									logoId={logoId}
									icon={icon}
									active={source === option.id}
									onClick={() => setSource(option.id)}
								/>
							);
						})}
					</div>
				</section>

				<section className="space-y-4">
					<div className="space-y-2">
						<p className="text-xs uppercase tracking-wide text-muted-foreground">
							Step 2
						</p>
						<h3 className="text-xl font-semibold">
							{flow ? flow.prompt : "Choose a source to continue."}
						</h3>
					</div>
					{flow ? (
						<div className="grid gap-3 sm:grid-cols-2">
							{flow.options.map((option) => (
								<OptionCard
									key={option.id}
									label={option.label}
									description={option.description}
									active={pathId === option.id}
									onClick={() => setPathId(option.id)}
								/>
							))}
						</div>
					) : (
						<div className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
							Select where you are migrating from to see the next
							options.
						</div>
					)}
				</section>
			</div>

			{selectedOption ? (
				<section className="space-y-6">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="space-y-1">
							<p className="text-xs uppercase tracking-wide text-muted-foreground">
								Step 3
							</p>
							<h3 className="text-xl font-semibold">
								Review the changes
							</h3>
							<p className="text-xs text-muted-foreground">
								{selectedOption.label}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<div className="flex items-center gap-1 rounded-full border border-border/60 p-1">
								<Button
									type="button"
									variant={diffView === "split" ? "secondary" : "ghost"}
									size="sm"
									className={cn(
										"rounded-full px-3",
										diffView === "split" && "shadow-sm"
									)}
									onClick={() => setDiffView("split")}
									aria-pressed={diffView === "split"}
								>
									Split
								</Button>
								<Button
									type="button"
									variant={diffView === "diff" ? "secondary" : "ghost"}
									size="sm"
									className={cn(
										"rounded-full px-3",
										diffView === "diff" && "shadow-sm"
									)}
									onClick={() => setDiffView("diff")}
									aria-pressed={diffView === "diff"}
								>
									Diff
								</Button>
							</div>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									setSource(null);
									setPathId(null);
								}}
							>
								Start over
							</Button>
						</div>
					</div>

					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{selectedOption.steps.map((step) => (
							<div
								key={`${selectedOption.id}-${step.title}`}
								className="rounded-xl border border-border/60 p-4"
							>
								<p className="text-sm font-semibold">{step.title}</p>
								<p className="text-xs text-muted-foreground">
									{step.description}
								</p>
							</div>
						))}
					</div>

					{diffView === "split" ? (
						<div className="space-y-6">
							<div className="space-y-3">
								<div className="space-y-1">
									<p className="text-xs uppercase tracking-wide text-muted-foreground">
										Before & After
									</p>
									<p className="text-sm text-muted-foreground">
										Compare your current integration with the AI Stats version,
										or switch to Diff for a single view.
									</p>
								</div>
								<div className="grid gap-6 lg:grid-cols-2">
									<div className="space-y-2">
										<p className="text-xs uppercase tracking-wide text-muted-foreground">
											Before
										</p>
										<CodeBlock
											label={beforeSnippet?.label}
											code={beforeSnippet?.code ?? ""}
											lang={beforeSnippet?.lang}
										/>
									</div>
									<div className="space-y-2">
										<p className="text-xs uppercase tracking-wide text-muted-foreground">
											After
										</p>
										<CodeBlock
											label={selectedOption?.snippet.label}
											code={selectedOption?.snippet.code ?? ""}
											lang={selectedOption?.snippet.lang}
										/>
									</div>
								</div>
							</div>
							{changeNotes.length > 0 ? (
								<div className="space-y-3">
									<p className="text-xs uppercase tracking-wide text-muted-foreground">
										Key changes
									</p>
									<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
										{changeNotes.map((note) => (
											<div
												key={`${selectedOption.id}-${note.title}`}
												className="rounded-xl border border-border/60 p-4"
											>
												<p className="text-sm font-semibold">
													{note.title}
												</p>
												<p className="text-xs text-muted-foreground">
													{note.description}
												</p>
											</div>
										))}
									</div>
								</div>
							) : null}
						</div>
					) : (
						<div className="space-y-2">
							<p className="text-xs uppercase tracking-wide text-muted-foreground">
								Diff
							</p>
							<CodeBlock
								label={diffSnippet?.label}
								code={diffSnippet?.code ?? ""}
								lang={diffSnippet?.lang}
							/>
						</div>
					)}

					<div className="space-y-3">
						<p className="text-xs uppercase tracking-wide text-muted-foreground">
							Documentation
						</p>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
							{DOC_LINKS.map((link) => (
								<Link
									key={link.href}
									href={link.href}
									className="rounded-xl border border-border/60 p-4 transition hover:border-primary/40 hover:bg-muted/40"
								>
									<p className="text-sm font-semibold">{link.label}</p>
									<p className="text-xs text-muted-foreground">
										{link.description}
									</p>
								</Link>
							))}
						</div>
					</div>
				</section>
			) : null}
		</div>
	);
}
