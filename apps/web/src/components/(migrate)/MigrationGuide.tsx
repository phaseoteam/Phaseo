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
	| "requesty"
	| "llm-gateway"
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
type AfterApiSurface = "chat-completions" | "responses" | "anthropic-messages";
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
		id: "requesty",
		label: "Requesty",
		description: "Using Requesty as an OpenAI-compatible gateway.",
	},
	{
		id: "llm-gateway",
		label: "LLM Gateway",
		description: "Using LLMGateway as an OpenAI-compatible endpoint.",
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
	"llm-gateway": "llmgateway",
	"openai-compatible": "openai",
};

const AFTER_API_SURFACE_OPTIONS: Array<{
	id: AfterApiSurface;
	label: string;
}> = [
	{ id: "chat-completions", label: "Chat Completions" },
	{ id: "responses", label: "Responses" },
	{ id: "anthropic-messages", label: "Anthropic Messages" },
];

const DOC_LINKS = [
        {
                label: "API Reference",
                description: "Endpoints, auth, and error formats.",
                href: "https://docs.phaseo.app/v1/api-reference/introduction",
	},
	{
		label: "Quickstart",
		description: "Make your first Gateway call in minutes.",
		href: "https://docs.phaseo.app/v1/quickstart",
	},
	{
		label: "Tool Calling",
		description: "Tools, tool_choice, and function routing.",
		href: "https://docs.phaseo.app/v1/guides/tool-calling",
	},
        {
                label: "Structured Outputs",
                description: "Schema-locked responses with constraints.",
                href: "https://docs.phaseo.app/v1/guides/structured-outputs",
        },
        {
                label: "Feature Parity Matrix",
                description: "Gateway migration parity by surface and competitor.",
                href: "https://docs.phaseo.app/v1/migration-guides/feature-parity-matrix",
        },
        {
                label: "Gateway Parity Review",
                description: "Repo-grounded review of proven and still-open parity areas.",
                href: "https://docs.phaseo.app/v1/migration-guides/gateway-parity-review",
        },
] as const;

const SHARED_STEPS = {
	key: {
		title: "Use your Phaseo API key",
		description:
			"Create a key in the Phaseo dashboard and store it as PHASEO_API_KEY.",
	},
	baseUrl: {
		title: "Point the base URL to Phaseo",
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
  apiKey: process.env.PHASEO_API_KEY ?? "YOUR_API_KEY",
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
    api_key=os.getenv("PHASEO_API_KEY", "YOUR_API_KEY"),
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
  apiKey: process.env.PHASEO_API_KEY ?? "YOUR_API_KEY",
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
    api_key=os.getenv("PHASEO_API_KEY", "YOUR_API_KEY"),
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
		label: "Phaseo SDK (TypeScript)",
		lang: "ts",
		code: `import Phaseo from "@phaseo/sdk";

const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY ?? "YOUR_API_KEY",
});

const response = await client.generateText({
  model: "openai/gpt-4.1-mini",
  messages: [{ role: "user", content: "Ship a migration checklist." }],
});

console.log(response);`,
	},
	"py-sdk": {
		label: "Phaseo SDK (Python)",
		lang: "python",
		code: `from phaseo import Phaseo
import asyncio

async def main():
    async with Phaseo(api_key="YOUR_API_KEY") as client:
        response = await client.generate_text(
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
import { createPhaseo } from "@phaseo/ai-sdk-provider";

const phaseo = createPhaseo({
  apiKey: process.env.PHASEO_API_KEY ?? "YOUR_API_KEY",
  baseURL: "${BASE_URL}",
});

const { text } = await generateText({
  model: phaseo("openai/gpt-4.1-mini"),
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
		code: `// No Phaseo client configured yet.`,
	},
	"py-sdk": {
		label: "Before (No SDK configured)",
		lang: "python",
		code: `# No Phaseo client configured yet.`,
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

const BEFORE_SNIPPETS_REQUESTY: Partial<Record<PathId, Snippet>> = {
	"ts-openai": {
		label: "Before (Requesty + OpenAI SDK)",
		lang: "ts",
		code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.REQUESTY_API_KEY ?? "YOUR_REQUESTY_KEY",
  baseURL: "https://router.requesty.ai/v1",
});

const response = await client.chat.completions.create({
  model: "openai/gpt-4o",
  messages: [{ role: "user", content: "Ship a migration checklist." }],
});

console.log(response);`,
	},
	rest: {
		label: "Before (Requesty REST)",
		lang: "bash",
		code: `curl -s "https://router.requesty.ai/v1/chat/completions" \\
  -H "Authorization: Bearer $REQUESTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-4o",
    "messages": [
      { "role": "user", "content": "Ship a migration checklist." }
    ]
  }'`,
	},
};

const BEFORE_SNIPPETS_LLM_GATEWAY: Partial<Record<PathId, Snippet>> = {
	"ts-openai": {
		label: "Before (LLMGateway + OpenAI SDK)",
		lang: "ts",
		code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.LLM_GATEWAY_API_KEY ?? "YOUR_LLM_GATEWAY_KEY",
  baseURL: "https://api.llmgateway.io/v1",
});

const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Ship a migration checklist." }],
});

console.log(response);`,
	},
	rest: {
		label: "Before (LLMGateway REST)",
		lang: "bash",
		code: `curl -s "https://api.llmgateway.io/v1/chat/completions" \\
  -H "Authorization: Bearer $LLM_GATEWAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
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
+  apiKey: process.env.PHASEO_API_KEY ?? "YOUR_API_KEY",
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
+    api_key=os.getenv("PHASEO_API_KEY", "YOUR_API_KEY"),
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
+  apiKey: process.env.PHASEO_API_KEY ?? "YOUR_API_KEY",
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
+    api_key=os.getenv("PHASEO_API_KEY", "YOUR_API_KEY"),
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
		code: `-// No Phaseo client configured yet.
+import Phaseo from "@phaseo/sdk";
+
+const client = new Phaseo({
+  apiKey: process.env.PHASEO_API_KEY ?? "YOUR_API_KEY",
+});
+
+const response = await client.generateText({
+  model: "openai/gpt-4.1-mini",
+  messages: [{ role: "user", content: "Ship a migration checklist." }],
+});
+
+console.log(response);`,
	},
	"py-sdk": {
		label: "Diff",
		lang: "diff",
		code: `-# No Phaseo client configured yet.
+from phaseo import Phaseo
+import asyncio
+
+async def main():
+    async with Phaseo(api_key="YOUR_API_KEY") as client:
+        response = await client.generate_text(
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
 import { createPhaseo } from "@phaseo/ai-sdk-provider";

 const phaseo = createPhaseo({
-  apiKey: process.env.OPENAI_API_KEY ?? "YOUR_OPENAI_KEY",
+  apiKey: process.env.PHASEO_API_KEY ?? "YOUR_API_KEY",
+  baseURL: "${BASE_URL}",
 });

 const { text } = await generateText({
-  model: openai("gpt-4.1-mini"),
+  model: phaseo("openai/gpt-4.1-mini"),
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
+  apiKey: process.env.PHASEO_API_KEY ?? "YOUR_API_KEY",
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

const DIFF_SNIPPETS_REQUESTY: Partial<Record<PathId, Snippet>> = {
	"ts-openai": {
		label: "Diff",
		lang: "diff",
		code: ` import OpenAI from "openai";

 const client = new OpenAI({
-  apiKey: process.env.REQUESTY_API_KEY ?? "YOUR_REQUESTY_KEY",
-  baseURL: "https://router.requesty.ai/v1",
+  apiKey: process.env.PHASEO_API_KEY ?? "YOUR_API_KEY",
+  baseURL: "${BASE_URL}",
 });

 const response = await client.chat.completions.create({
-  model: "openai/gpt-4o",
+  model: "openai/gpt-4.1-mini",
  messages: [{ role: "user", content: "Ship a migration checklist." }],
 });
`,
	},
	rest: {
		label: "Diff",
		lang: "diff",
		code: `-curl -s "https://router.requesty.ai/v1/chat/completions" \\
-  -H "Authorization: Bearer $REQUESTY_API_KEY" \\
+curl -s "${BASE_URL}/chat/completions" \\
+  -H "Authorization: Bearer YOUR_API_KEY" \\
 -H "Content-Type: application/json" \\
 -d '{
-    "model": "openai/gpt-4o",
+    "model": "openai/gpt-4.1-mini",
    "messages": [
      { "role": "user", "content": "Ship a migration checklist." }
     ]
   }'`,
	},
};

const DIFF_SNIPPETS_LLM_GATEWAY: Partial<Record<PathId, Snippet>> = {
	"ts-openai": {
		label: "Diff",
		lang: "diff",
		code: ` import OpenAI from "openai";

 const client = new OpenAI({
-  apiKey: process.env.LLM_GATEWAY_API_KEY ?? "YOUR_LLM_GATEWAY_KEY",
-  baseURL: "https://api.llmgateway.io/v1",
+  apiKey: process.env.PHASEO_API_KEY ?? "YOUR_API_KEY",
+  baseURL: "${BASE_URL}",
 });

 const response = await client.chat.completions.create({
-  model: "gpt-4o",
+  model: "openai/gpt-4.1-mini",
  messages: [{ role: "user", content: "Ship a migration checklist." }],
 });
`,
	},
	rest: {
		label: "Diff",
		lang: "diff",
		code: `-curl -s "https://api.llmgateway.io/v1/chat/completions" \\
-  -H "Authorization: Bearer $LLM_GATEWAY_API_KEY" \\
+curl -s "${BASE_URL}/chat/completions" \\
+  -H "Authorization: Bearer YOUR_API_KEY" \\
 -H "Content-Type: application/json" \\
 -d '{
-    "model": "gpt-4o",
+    "model": "openai/gpt-4.1-mini",
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
	if (source === "requesty") {
		const override = BEFORE_SNIPPETS_REQUESTY[pathId];
		if (override) {
			return override;
		}
	}
	if (source === "llm-gateway") {
		const override = BEFORE_SNIPPETS_LLM_GATEWAY[pathId];
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
	if (source === "requesty") {
		const override = DIFF_SNIPPETS_REQUESTY[pathId];
		if (override) {
			return override;
		}
	}
	if (source === "llm-gateway") {
		const override = DIFF_SNIPPETS_LLM_GATEWAY[pathId];
		if (override) {
			return override;
		}
	}

	return DIFF_SNIPPETS[pathId];
};

const CHANGE_NOTES: Record<PathId, ChangeNote[]> = {
	"ts-openai": [
		{
			title: "Use your Phaseo Gateway key",
			description:
				"Replace OPENAI_API_KEY with PHASEO_API_KEY from the Phaseo dashboard.",
		},
		{
			title: "Route requests through Phaseo",
			description: `Set baseURL to ${BASE_URL} so traffic goes through the Gateway.`,
		},
		{
			title: "Update model ids",
			description:
				"Use Phaseo model ids like openai/gpt-4.1-mini. Find them on each model quickstart page.",
		},
	],
	"py-openai": [
		{
			title: "Use your Phaseo Gateway key",
			description:
				"Replace OPENAI_API_KEY with PHASEO_API_KEY from the Phaseo dashboard.",
		},
		{
			title: "Route requests through Phaseo",
			description: `Set base_url to ${BASE_URL} so traffic goes through the Gateway.`,
		},
		{
			title: "Update model ids",
			description:
				"Use Phaseo model ids like openai/gpt-4.1-mini. Find them on each model quickstart page.",
		},
	],
	"ts-anthropic": [
		{
			title: "Use your Phaseo Gateway key",
			description:
				"Replace ANTHROPIC_API_KEY with PHASEO_API_KEY from the Phaseo dashboard.",
		},
		{
			title: "Route requests through Phaseo",
			description: `Set baseURL to ${BASE_URL} so traffic goes through the Gateway.`,
		},
		{
			title: "Update model ids",
			description:
				"Use Phaseo model ids like anthropic/claude-3.5-sonnet. Find them on each model quickstart page.",
		},
	],
	"py-anthropic": [
		{
			title: "Use your Phaseo Gateway key",
			description:
				"Replace ANTHROPIC_API_KEY with PHASEO_API_KEY from the Phaseo dashboard.",
		},
		{
			title: "Route requests through Phaseo",
			description: `Set base_url to ${BASE_URL} so traffic goes through the Gateway.`,
		},
		{
			title: "Update model ids",
			description:
				"Use Phaseo model ids like anthropic/claude-3.5-sonnet. Find them on each model quickstart page.",
		},
	],
	rest: [
		{
			title: "Use your Phaseo Gateway key",
			description: "Send Authorization: Bearer YOUR_API_KEY on every request.",
		},
		{
			title: "Route requests through Phaseo",
			description: `Send requests to ${BASE_URL}/chat/completions.`,
		},
		{
			title: "Update model ids",
			description:
				"Use Phaseo model ids like openai/gpt-4.1-mini. Find them on each model quickstart page.",
		},
	],
	"ts-sdk": [
		{
			title: "Use your Phaseo Gateway key",
			description:
				"Set PHASEO_API_KEY from the Phaseo dashboard for the SDK client.",
		},
		{
			title: "Update model ids",
			description:
				"Use Phaseo model ids like openai/gpt-4.1-mini. Find them on each model quickstart page.",
		},
	],
	"py-sdk": [
		{
			title: "Use your Phaseo Gateway key",
			description:
				"Set PHASEO_API_KEY from the Phaseo dashboard for the SDK client.",
		},
		{
			title: "Update model ids",
			description:
				"Use Phaseo model ids like openai/gpt-4.1-mini. Find them on each model quickstart page.",
		},
	],
	"vercel-ai-sdk": [
		{
			title: "Use your Phaseo Gateway key",
			description:
				"Replace OPENAI_API_KEY with PHASEO_API_KEY from the Phaseo dashboard.",
		},
		{
			title: "Switch to the Phaseo AI SDK provider",
			description:
				"Replace the Vercel OpenAI provider factory with createPhaseo(...) from @phaseo/ai-sdk-provider.",
		},
		{
			title: "Update model ids",
			description:
				"Use Phaseo model ids like openai/gpt-4.1-mini. Find them on each model quickstart page.",
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
				description: "Point the Python SDK to Phaseo.",
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
				description: "Point the Python SDK to Phaseo.",
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
				description: "Replace the Vercel/OpenAI provider factory with the official Phaseo provider.",
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
	requesty: {
		prompt: "How do you call Requesty today?",
		options: [
			{
				id: "ts-openai",
				label: "OpenAI-compatible SDK",
				description: "Keep the client and swap env vars plus base URL.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS["ts-openai"],
			},
			{
				id: "py-openai",
				label: "Python SDK",
				description: "Use OpenAI Python client settings for Phaseo.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS["py-openai"],
			},
			{
				id: "rest",
				label: "REST",
				description: "Switch REST calls to Phaseo Gateway.",
				steps: [SHARED_STEPS.headers, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS.rest,
			},
		],
	},
	"llm-gateway": {
		prompt: "How do you call LLMGateway today?",
		options: [
			{
				id: "ts-openai",
				label: "OpenAI-compatible SDK",
				description: "Keep the client and swap env vars plus base URL.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS["ts-openai"],
			},
			{
				id: "py-openai",
				label: "Python SDK",
				description: "Use OpenAI Python client settings for Phaseo.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.baseUrl, SHARED_STEPS.payload],
				snippet: SNIPPETS["py-openai"],
			},
			{
				id: "rest",
				label: "REST",
				description: "Switch REST calls to Phaseo Gateway.",
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
				description: "Use the OpenAI Python client with Phaseo.",
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
				label: "Phaseo SDK (TypeScript)",
				description: "Full typed client with helpers.",
				steps: [SHARED_STEPS.key, SHARED_STEPS.payload],
				snippet: SNIPPETS["ts-sdk"],
			},
			{
				id: "py-sdk",
				label: "Phaseo SDK (Python)",
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

const FULL_GUIDE_LINK_BY_SOURCE: Partial<
	Record<SourceId, { href: string; label: string }>
> = {
	openrouter: {
		href: "/migrate/openrouter",
		label: "OpenRouter",
	},
	"vercel-ai": {
		href: "/migrate/vercel-ai-gateway",
		label: "Vercel AI Gateway",
	},
	requesty: {
		href: "/migrate/requesty",
		label: "Requesty",
	},
	"llm-gateway": {
		href: "/migrate/llmgateway",
		label: "LLM Gateway",
	},
};

function getAfterSnippet(pathId: PathId, surface: AfterApiSurface): Snippet {
	if (surface === "chat-completions") {
		return SNIPPETS[pathId];
	}

	if (surface === "responses") {
		if (pathId === "py-openai" || pathId === "py-sdk" || pathId === "py-anthropic") {
			return {
				label: "Responses API (Python)",
				lang: "python",
				code: `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv("PHASEO_API_KEY", "YOUR_API_KEY"),
    base_url="${BASE_URL}",
)

response = client.responses.create(
    model="openai/gpt-4.1-mini",
    input="Ship a migration checklist."
)

print(response.output_text)`,
			};
		}

		if (pathId === "rest") {
			return {
				label: "Responses API (cURL)",
				lang: "bash",
				code: `curl -s "${BASE_URL}/responses" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "openai/gpt-4.1-mini",
    "input": "Ship a migration checklist."
  }'`,
			};
		}

		return {
			label: "Responses API (TypeScript)",
			lang: "ts",
			code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY ?? "YOUR_API_KEY",
  baseURL: "${BASE_URL}",
});

const response = await client.responses.create({
  model: "openai/gpt-4.1-mini",
  input: "Ship a migration checklist.",
});

console.log(response.output_text);`,
		};
	}

	// surface === "anthropic-messages"
	if (pathId === "py-openai" || pathId === "py-sdk" || pathId === "py-anthropic") {
		return {
			label: "Anthropic Messages (Python)",
			lang: "python",
			code: `from anthropic import Anthropic
import os

client = Anthropic(
    api_key=os.getenv("PHASEO_API_KEY", "YOUR_API_KEY"),
    base_url="${BASE_URL}",
)

response = client.messages.create(
    model="anthropic/claude-3.5-sonnet",
    max_tokens=512,
    messages=[{"role": "user", "content": "Ship a migration checklist."}],
)

print(response)`,
		};
	}

	if (pathId === "rest") {
		return {
			label: "Anthropic Messages (cURL)",
			lang: "bash",
			code: `curl -s "${BASE_URL}/anthropic/messages" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "anthropic/claude-3.5-sonnet",
    "max_tokens": 512,
    "messages": [
      { "role": "user", "content": "Ship a migration checklist." }
    ]
  }'`,
		};
	}

	return {
		label: "Anthropic Messages (TypeScript)",
		lang: "ts",
		code: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.PHASEO_API_KEY ?? "YOUR_API_KEY",
  baseURL: "${BASE_URL}",
});

const response = await client.messages.create({
  model: "anthropic/claude-3.5-sonnet",
  max_tokens: 512,
  messages: [{ role: "user", content: "Ship a migration checklist." }],
});

console.log(response);`,
	};
}

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
	const [afterSurface, setAfterSurface] =
		useState<AfterApiSurface>("chat-completions");

	useEffect(() => {
		setPathId(null);
	}, [source]);

	useEffect(() => {
		if (pathId === "ts-anthropic" || pathId === "py-anthropic") {
			setAfterSurface("anthropic-messages");
			return;
		}
		setAfterSurface("chat-completions");
	}, [pathId]);

	const selectedOption = flow?.options.find((option) => option.id === pathId);
	const beforeSnippet =
		source && selectedOption
			? getBeforeSnippet(source, selectedOption.id)
			: null;
	const diffSnippet =
		source && selectedOption
			? getDiffSnippet(source, selectedOption.id)
			: null;
	const afterSnippet = selectedOption
		? getAfterSnippet(selectedOption.id, afterSurface)
		: null;
	const changeNotes = selectedOption ? CHANGE_NOTES[selectedOption.id] ?? [] : [];
	const fullGuide = source ? FULL_GUIDE_LINK_BY_SOURCE[source] : null;

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
										Compare your current integration with the Phaseo version,
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
										<div className="flex flex-wrap items-center gap-2">
											{AFTER_API_SURFACE_OPTIONS.map((surfaceOption) => (
												<Button
													key={surfaceOption.id}
													type="button"
													variant={
														afterSurface === surfaceOption.id
															? "secondary"
															: "ghost"
													}
													size="sm"
													onClick={() => setAfterSurface(surfaceOption.id)}
													aria-pressed={afterSurface === surfaceOption.id}
													className="h-7 rounded-full px-3 text-xs"
												>
													{surfaceOption.label}
												</Button>
											))}
										</div>
										<CodeBlock
											label={afterSnippet?.label}
											code={afterSnippet?.code ?? ""}
											lang={afterSnippet?.lang}
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

			{fullGuide ? (
				<section className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
					<p className="text-sm">
						If you are migrating from {fullGuide.label}, check out the full
						step-by-step guide.{" "}
						<Link href={fullGuide.href} className="font-medium text-primary hover:underline">
							Read full guide
						</Link>
					</p>
				</section>
			) : null}
		</div>
	);
}
