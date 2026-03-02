// src/components/gateway/Endpoints.tsx
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import CodeBlock from "@/components/(data)/model/quickstart/CodeBlock";
import { BASE_URL } from "./config";
import { Server } from "lucide-react";
import PathCell from "./PathCell";
import Link from "next/link";

export default async function Endpoints() {
	const modelsExample = `curl -s ${BASE_URL}/api/models \\
  -H "Authorization: Bearer $AI_STATS_API_KEY" | jq '.[0:5]'`;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Server className="h-5 w-5 text-primary" /> Endpoints
				</CardTitle>
				<CardDescription>
					Our main gateway endpoints. See more on the{" "}
					<Link
						href="https://docs.ai-stats.phaseo.app/"
						className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200"
					>
						documentation
					</Link>
					.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="rounded-lg border overflow-hidden">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b bg-gradient-to-r from-primary/10 to-transparent">
								<th className="p-3 text-left">Method</th>
								<th className="p-3 text-left">Path</th>
								<th className="p-3 text-left">Notes</th>
							</tr>
						</thead>
						<tbody className="[&_tr:nth-child(even)]:bg-muted/30">
							<tr className="border-b">
								<td className="p-3 font-mono text-xs">GET</td>
								<PathCell className="p-3 font-mono text-xs">
									/v1/api/models
								</PathCell>
								<td className="p-3">
									Access all available models and their
									metadata (capabilities, provider, and
									supported formats).
								</td>
							</tr>
							<tr className="border-b">
								<td className="p-3 font-mono text-xs">POST</td>
								<PathCell className="p-3 font-mono text-xs">
									/v1/chat
								</PathCell>
								<td className="p-3">
									Get a chat-style response from a
									conversational model; supports streaming.
								</td>
							</tr>
							<tr className="border-b">
								<td className="p-3 font-mono text-xs">POST</td>
								<PathCell className="p-3 font-mono text-xs">
									/v1/images
								</PathCell>
								<td className="p-3">
									Create images using image-capable models
									(generations, edits, variations).
								</td>
							</tr>

							<tr className="border-b">
								<td className="p-3 font-mono text-xs">POST</td>
								<PathCell className="p-3 font-mono text-xs">
									/v1/video
								</PathCell>
								<td className="p-3">
									Create or process videos using video-capable
									models (generations, transformations).
								</td>
							</tr>
							<tr className="border-b">
								<td className="p-3 font-mono text-xs">POST</td>
								<PathCell className="p-3 font-mono text-xs">
									/v1/embeddings
								</PathCell>
								<td className="p-3">
									Request vector embeddings for text or other
									supported inputs.
								</td>
							</tr>
							<tr>
								<td className="p-3 font-mono text-xs">POST</td>
								<PathCell className="p-3 font-mono text-xs">
									/v1/moderation
								</PathCell>
								<td className="p-3">
									Moderate text or image content for policy
									compliance and safety checks.
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<div className="space-y-2">
					<h4 className="text-sm font-semibold">List models</h4>
					<CodeBlock code={modelsExample} lang="bash" label="bash" />
				</div>

				<div className="space-y-2">
					<h4 className="text-sm font-semibold">Auth</h4>
					<p className="text-sm text-muted-foreground">
						Send <code>Authorization: Bearer &lt;your key&gt;</code>{" "}
						on every request. Keys begin with <code>aistats_</code>.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
