"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ModelPageNotice as ModelPageNoticeData } from "@/lib/fetchers/models/getModelPageNotice";
import { modelMarkdownComponents } from "./modelMarkdown";

const TONE_STYLES: Record<
	ModelPageNoticeData["tone"],
	{
		icon: typeof Info;
		className: string;
		descriptionClassName: string;
	}
> = {
	info: {
		icon: Info,
		className:
			"border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-50",
		descriptionClassName: "text-sky-900/90 dark:text-sky-100/90",
	},
	warning: {
		icon: AlertTriangle,
		className:
			"border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-50",
		descriptionClassName: "text-amber-900/90 dark:text-amber-100/90",
	},
	critical: {
		icon: AlertCircle,
		className:
			"border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-50",
		descriptionClassName: "text-red-900/90 dark:text-red-100/90",
	},
};

export default function ModelPageNotice({
	notice,
}: {
	notice: ModelPageNoticeData;
}) {
	const style = TONE_STYLES[notice.tone];
	const Icon = style.icon;

	return (
		<Alert className={style.className}>
			<Icon className="h-4 w-4" />
			<AlertDescription className={style.descriptionClassName}>
				<div
					className="
						text-sm leading-6
						[&_ol]:list-decimal [&_ol]:pl-5
						[&_ul]:list-disc [&_ul]:pl-5
						[&_li]:my-1
					"
				>
					<ReactMarkdown
						remarkPlugins={[remarkGfm]}
						components={modelMarkdownComponents}
					>
						{notice.markdown}
					</ReactMarkdown>
				</div>
			</AlertDescription>
		</Alert>
	);
}
