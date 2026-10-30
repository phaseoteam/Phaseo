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
import { getTranslations } from "next-intl/server";

export default async function Endpoints() {
	const t = await getTranslations("Catalogue.models.detail.quickstart");
	const modelsExample = `curl -s ${BASE_URL}/api/models \\
  -H "Authorization: Bearer $PHASEO_API_KEY" | jq '.[0:5]'`;

	return (
		<Card>
			<CardHeader>
			<CardTitle className="flex items-center gap-2">
					<Server className="h-5 w-5 text-primary" /> {t("gatewayEndpointsTitle")}
				</CardTitle>
				<CardDescription>
					{t.rich("gatewayEndpointsDescription", {
						documentation: (chunks) => (
							<Link
								href="https://phaseo.app/"
								className="relative underline decoration-transparent transition-colors duration-200 hover:decoration-current"
							>
								{chunks}
							</Link>
						),
					})}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="rounded-lg border overflow-hidden">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b bg-gradient-to-r from-primary/10 to-transparent">
								<th className="p-3 text-left">{t("endpointMethod")}</th>
								<th className="p-3 text-left">{t("endpointPath")}</th>
								<th className="p-3 text-left">{t("endpointNotes")}</th>
							</tr>
						</thead>
						<tbody className="[&_tr:nth-child(even)]:bg-muted/30">
							<tr className="border-b">
								<td className="p-3 font-mono text-xs">GET</td>
								<PathCell className="p-3 font-mono text-xs">
									/v1/api/models
								</PathCell>
								<td className="p-3">
									{t("modelsEndpointDescription")}
								</td>
							</tr>
							<tr className="border-b">
								<td className="p-3 font-mono text-xs">POST</td>
								<PathCell className="p-3 font-mono text-xs">
									/v1/chat
								</PathCell>
								<td className="p-3">
									{t("chatEndpointDescription")}
								</td>
							</tr>
							<tr className="border-b">
								<td className="p-3 font-mono text-xs">POST</td>
								<PathCell className="p-3 font-mono text-xs">
									/v1/images
								</PathCell>
								<td className="p-3">
									{t("imageEndpointDescription")}
								</td>
							</tr>

							<tr className="border-b">
								<td className="p-3 font-mono text-xs">POST</td>
								<PathCell className="p-3 font-mono text-xs">
									/v1/video
								</PathCell>
								<td className="p-3">
									{t("videoEndpointDescription")}
								</td>
							</tr>
							<tr className="border-b">
								<td className="p-3 font-mono text-xs">POST</td>
								<PathCell className="p-3 font-mono text-xs">
									/v1/embeddings
								</PathCell>
								<td className="p-3">
									{t("embeddingsEndpointDescription")}
								</td>
							</tr>
							<tr>
								<td className="p-3 font-mono text-xs">POST</td>
								<PathCell className="p-3 font-mono text-xs">
									/v1/moderation
								</PathCell>
								<td className="p-3">
									{t("moderationEndpointDescription")}
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<div className="space-y-2">
					<h4 className="text-sm font-semibold">{t("listModels")}</h4>
					<CodeBlock code={modelsExample} lang="bash" label="bash" />
				</div>

				<div className="space-y-2">
					<h4 className="text-sm font-semibold">{t("authentication")}</h4>
					<p className="text-sm text-muted-foreground">
						{t.rich("authenticationDescription", {
							header: "Authorization: Bearer <your key>",
							prefix: "phaseo_v1_sk_",
							code: (chunks) => <code>{chunks}</code>,
						})}
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
