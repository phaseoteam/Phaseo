// src/components/gateway/Streaming.tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import CodeBlock from "@/components/(data)/model/quickstart/CodeBlock";
import { Separator } from "@/components/ui/separator";
import { BASE_URL } from "./config";
import { safeDecodeURIComponent } from "@/lib/utils/safe-decode";
import { resolveGatewayPath } from "./endpoint-paths";
import { capabilityToEndpoints } from "@/lib/config/capabilityToEndpoints";

export default async function Streaming({
        modelId,
        endpoint,
}: {
        modelId?: string;
        endpoint?: string | null;
}) {
        const model = safeDecodeURIComponent(modelId) || "model_id_here";
        const normalizedEndpoint = endpoint?.toLowerCase() ?? null;
        const streamingPaths = new Set(["/chat/completions", "/responses"]);
        const mapped =
                normalizedEndpoint ? capabilityToEndpoints[normalizedEndpoint] ?? [] : [];
        const streamingPath = mapped.find((value) => streamingPaths.has(value));
        const endpointPath = streamingPath ?? resolveGatewayPath(endpoint);
        const endpointUrl = `${BASE_URL}${endpointPath}`;

	const curlStream = `# 1) Set your key
export AI_STATS_API_KEY="sk-live-***"

# 2) Send a streaming request
curl -s ${endpointUrl} \\
-H "Authorization: Bearer $AI_STATS_API_KEY" \\
-H "Content-Type: application/json" \\
-d '{\n    "model": "${model}",\n    "stream": true,\n    "messages": [{ "role": "user", "content": "Write a haiku about rainy Tuesdays." }]\n}'`;

	const nodeStream =
		`// 1) Set your key
const apiKey = process.env.AI_STATS_API_KEY;

// 2) Send a streaming request
const res = await fetch("${endpointUrl}", {
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		"Authorization": ` +
		"`Bearer ${apiKey}`" +
		`,
	},
	body: JSON.stringify({
		model: "${model}",
		stream: true,
		messages: [{ role: "user", content: "Write a haiku about rainy Tuesdays." }],
	}),
});

if (!res.body) {
	console.error("No streaming body from server");
	process.exit(1);
}

const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) {
	const { value, done } = await reader.read();
	if (done) break;
	const chunk = decoder.decode(value, { stream: true });
	process.stdout.write(chunk);
}`;

	const pythonStream = `# Import os and requests libraries
import os
import requests

# Get your API key
API_KEY = os.environ.get("AI_STATS_API_KEY")

# Send a streaming request
url = "${endpointUrl}"
payload = {
	"model": "${model}",
	"stream": True,
	"messages": [
		{"role": "user", "content": "Write a haiku about rainy Tuesdays."}
	]
}

with requests.post(url, json=payload, headers={
	"Authorization": f"Bearer {API_KEY}",
	"Content-Type": "application/json",
}, stream=True) as resp:
	for line in resp.iter_lines(decode_unicode=True):
		if line:
			print(line)
`;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Streaming (SSE)</CardTitle>
				<CardDescription>
					Token-by-token output from chat completions. Streaming is
					enabled by including "stream: true" in the request body — it
					really is that easy, and it can be used with any model.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-3">
					<p className="text-sm text-muted-foreground">
						Note: Streaming returns token-by-token output from the
						server. Use the example for your preferred language
						below.
					</p>
				</div>

				<Separator />

				<Tabs defaultValue="curl" className="w-full">
					<TabsList>
						<TabsTrigger value="curl">cURL</TabsTrigger>
						<TabsTrigger value="node">TypeScript</TabsTrigger>
						<TabsTrigger value="python">Python</TabsTrigger>
					</TabsList>
					<TabsContent value="curl" className="mt-4">
						<CodeBlock code={curlStream} lang="bash" label="bash" />
					</TabsContent>
					<TabsContent value="node" className="mt-4">
						<CodeBlock code={nodeStream} lang="ts" label="ts" />
					</TabsContent>
					<TabsContent value="python" className="mt-4">
						<CodeBlock
							code={pythonStream}
							lang="python"
							label="python"
						/>
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}
