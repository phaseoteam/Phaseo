// src/components/gateway/Endpoints.tsx
import { useTranslations } from "@/i18n/react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "@/components/link";

export default function Endpoints() {
	const t = useTranslations("Catalogue.models.detail.quickstart");
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
					<Table wrapInContainer={false} className="w-full text-sm">
						<TableHeader>
							<TableRow className="border-b bg-gradient-to-r from-primary/10 to-transparent hover:bg-transparent dark:hover:bg-transparent">
								<TableHead className="h-auto font-bold text-inherit dark:text-inherit p-3 text-left">{t("endpointMethod")}</TableHead>
								<TableHead className="h-auto font-bold text-inherit dark:text-inherit p-3 text-left">{t("endpointPath")}</TableHead>
								<TableHead className="h-auto font-bold text-inherit dark:text-inherit p-3 text-left">{t("endpointNotes")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody className="[&_tr:nth-child(even)]:bg-muted/30">
							<TableRow className="border-b">
								<TableCell className="p-3 font-mono text-xs">GET</TableCell>
								<PathCell className="p-3 font-mono text-xs">
									/v1/api/models
								</PathCell>
								<TableCell className="p-3">
									{t("modelsEndpointDescription")}
								</TableCell>
							</TableRow>
							<TableRow className="border-b">
								<TableCell className="p-3 font-mono text-xs">POST</TableCell>
								<PathCell className="p-3 font-mono text-xs">
									/v1/chat
								</PathCell>
								<TableCell className="p-3">
									{t("chatEndpointDescription")}
								</TableCell>
							</TableRow>
							<TableRow className="border-b">
								<TableCell className="p-3 font-mono text-xs">POST</TableCell>
								<PathCell className="p-3 font-mono text-xs">
									/v1/images
								</PathCell>
								<TableCell className="p-3">
									{t("imageEndpointDescription")}
								</TableCell>
							</TableRow>

							<TableRow className="border-b">
								<TableCell className="p-3 font-mono text-xs">POST</TableCell>
								<PathCell className="p-3 font-mono text-xs">
									/v1/video
								</PathCell>
								<TableCell className="p-3">
									{t("videoEndpointDescription")}
								</TableCell>
							</TableRow>
							<TableRow className="border-b">
								<TableCell className="p-3 font-mono text-xs">POST</TableCell>
								<PathCell className="p-3 font-mono text-xs">
									/v1/embeddings
								</PathCell>
								<TableCell className="p-3">
									{t("embeddingsEndpointDescription")}
								</TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="p-3 font-mono text-xs">POST</TableCell>
								<PathCell className="p-3 font-mono text-xs">
									/v1/moderation
								</PathCell>
								<TableCell className="p-3">
									{t("moderationEndpointDescription")}
								</TableCell>
							</TableRow>
						</TableBody>
					</Table>
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
