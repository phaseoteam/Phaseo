import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CALLOUT_TONES } from "@/components/ui/callout";
import type { ModelPageNotice as ModelPageNoticeData } from "@/lib/fetchers/models/getModelPageNotice";
import { modelMarkdownComponents } from "./modelMarkdown";

export default function ModelPageNotice({
	notice,
}: {
	notice: ModelPageNoticeData;
}) {
	const style = CALLOUT_TONES[notice.tone];
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
