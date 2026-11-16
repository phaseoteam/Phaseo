import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n/react";
import { captureProductEvent } from "@/lib/productAnalytics";
import { type AgentPromptOptions, buildAgentPrompt } from "./agentPrompt";

interface AgentPromptPanelProps extends AgentPromptOptions {
	analyticsModelId: string;
}

export function AgentPromptPanel({
	analyticsModelId,
	...promptOptions
}: AgentPromptPanelProps) {
	const t = useTranslations("Catalogue.models.detail.quickstart");
	const [copied, setCopied] = useState(false);
	const { endpointPath } = promptOptions;
	const prompt = buildAgentPrompt(promptOptions);

	useEffect(() => {
		if (!copied) return;
		const timer = window.setTimeout(() => setCopied(false), 1800);
		return () => window.clearTimeout(timer);
	}, [copied]);

	return (
		<div className="space-y-3">
			<div className="space-y-1">
				<h3 className="text-base font-semibold">{t("agentPromptTitle")}</h3>
				<p className="text-sm text-muted-foreground">{t("agentPromptDescription")}</p>
			</div>
			<div className="overflow-hidden rounded-md border border-border/70 bg-card">
				<div className="flex items-center justify-between gap-2 py-2 pl-4 pr-2">
					<span className="text-xs text-muted-foreground">{t("prompt")}</span>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						className="h-8 shrink-0 gap-1.5 rounded-md px-3 text-xs"
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(prompt);
								setCopied(true);
								captureProductEvent("quickstart_agent_prompt_copied", {
									endpoint: endpointPath ?? "",
									model_id: analyticsModelId,
								});
							} catch {
								setCopied(false);
							}
						}}
					>
						{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
						{copied ? t("copied") : t("copyPrompt")}
					</Button>
				</div>
				<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-border/70 px-4 py-3 font-mono text-xs leading-6 text-foreground">
					<code>{prompt}</code>
				</pre>
			</div>
		</div>
	);
}
