"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Streamdown } from "streamdown";
import { ToolPageHeader } from "@/components/(tools)/ToolPageHeader";
import { useTranslations } from "next-intl";

// turn literal "\n" sequences into real newlines
function decodeEscapedNewlines(input: string) {
	return input
		.replace(/\\r\\n/g, "\\n") // normalise windows
		.replace(/\\n\\n/g, "\n\n") // handle double first
		.replace(/\\n/g, "\n"); // then single
}

export default function MarkdownPreviewer() {
	const t = useTranslations("Product.tools.markdown");
	const [markdown, setMarkdown] = useState(
		"**Guiding on LLM construction**\\n\\nThe user is asking how to build a large language model (LLM) using Python on their computer."
	);

	const processedMarkdown = useMemo(
		() => decodeEscapedNewlines(markdown),
		[markdown]
	);

	return (
		<div className="container mx-auto px-4 py-8 sm:py-12">
			<ToolPageHeader title={t("title")} description={t("description")} />

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<Card>
					<CardHeader>
						<CardTitle>{t("input")}</CardTitle>
					</CardHeader>
					<CardContent>
						<Textarea
							value={markdown}
							onChange={(e) => setMarkdown(e.target.value)}
							className="min-h-[400px] font-mono"
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("preview")}</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="prose prose-sm max-w-none min-h-[400px] p-4 border rounded-lg bg-muted/50">
							{/* Streamdown renders the markdown */}
							<Streamdown>{processedMarkdown}</Streamdown>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
