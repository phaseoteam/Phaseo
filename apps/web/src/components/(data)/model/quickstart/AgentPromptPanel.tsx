import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "@/i18n/react";
import { captureProductEvent } from "@/lib/productAnalytics";
import {
	buildAgentSetupPrompt,
	buildAgentTaskPrompt,
	isAgentPromptFamily,
} from "./agentPrompt";
import { getLanguageFamilyVisual, OptionLabel } from "./QuickstartUsageSection";

interface AgentPromptPanelProps {
	families: Array<{ id: string; label: string }>;
	selectedFamilyId: string;
	onSelectFamily: (familyId: string) => void;
	modelId: string;
	endpointPath: string | null;
	analyticsModelId: string;
}

function useCopied() {
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) return;
		const timer = window.setTimeout(() => setCopied(false), 1800);
		return () => window.clearTimeout(timer);
	}, [copied]);
	return [copied, setCopied] as const;
}

function CopyPromptButton({
	text,
	kind,
	analytics,
}: {
	text: string;
	kind: "setup" | "task";
	analytics: { language: string; model_id: string };
}) {
	const t = useTranslations("Catalogue.models.detail.quickstart");
	const [copied, setCopied] = useCopied();
	return (
		<Button
			type="button"
			variant="secondary"
			size="sm"
			className="h-8 shrink-0 gap-1.5 rounded-md px-3 text-xs"
			onClick={async () => {
				try {
					await navigator.clipboard.writeText(text);
					setCopied(true);
					captureProductEvent("quickstart_agent_prompt_copied", {
						...analytics,
						prompt_kind: kind,
					});
				} catch {
					setCopied(false);
				}
			}}
		>
			{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
			{copied ? t("copied") : t("copyPrompt")}
		</Button>
	);
}

function PromptBody({ text }: { text: string }) {
	return (
		<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-border/70 px-4 py-3 font-mono text-xs leading-6 text-foreground">
			<code>{text}</code>
		</pre>
	);
}

export function AgentPromptPanel({
	families,
	selectedFamilyId,
	onSelectFamily,
	modelId,
	endpointPath,
	analyticsModelId,
}: AgentPromptPanelProps) {
	const t = useTranslations("Catalogue.models.detail.quickstart");
	const promptFamilies = families.filter((family) => isAgentPromptFamily(family.id));
	const activeFamily =
		promptFamilies.find((family) => family.id === selectedFamilyId) ?? promptFamilies[0];
	if (!activeFamily || !isAgentPromptFamily(activeFamily.id)) return null;

	const setupPrompt = buildAgentSetupPrompt(activeFamily.id);
	const taskPrompt = buildAgentTaskPrompt({ modelId, endpointPath });
	const analytics = { model_id: analyticsModelId, language: activeFamily.id };

	return (
		<div className="space-y-3">
			<div className="space-y-1">
				<h3 className="text-base font-semibold">{t("agentPromptTitle")}</h3>
				<p className="text-sm text-muted-foreground">{t("agentPromptDescription")}</p>
			</div>
			<div className="overflow-hidden rounded-md border border-border/70 bg-card">
				<div className="flex items-center justify-between gap-2 px-2 py-2">
					<div className="w-40">
						<Select value={activeFamily.id} onValueChange={onSelectFamily}>
							<SelectTrigger
								className="h-8 w-full rounded-md bg-muted/60 text-xs"
								aria-label={t("language")}
							>
								<SelectValue placeholder={t("language")}>
									<OptionLabel
										label={activeFamily.label}
										visual={getLanguageFamilyVisual(activeFamily.id)}
									/>
								</SelectValue>
							</SelectTrigger>
							<SelectContent
								align="start"
								alignItemWithTrigger={false}
								className="w-auto min-w-40 rounded-md"
							>
								<SelectGroup>
									<SelectLabel className="text-[11px] text-muted-foreground">
										{t("language")}
									</SelectLabel>
									<SelectSeparator />
									{promptFamilies.map((family) => (
										<SelectItem key={family.id} value={family.id}>
											<OptionLabel
												label={family.label}
												visual={getLanguageFamilyVisual(family.id)}
											/>
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<CopyPromptButton text={setupPrompt} kind="setup" analytics={analytics} />
				</div>
				<PromptBody text={setupPrompt} />
			</div>
			<p className="text-sm text-muted-foreground">{t("agentTaskDescription")}</p>
			<div className="overflow-hidden rounded-md border border-border/70 bg-card">
				<div className="flex items-center justify-between gap-2 py-2 pl-4 pr-2">
					<span className="text-xs text-muted-foreground">{t("prompt")}</span>
					<CopyPromptButton text={taskPrompt} kind="task" analytics={analytics} />
				</div>
				<PromptBody text={taskPrompt} />
			</div>
		</div>
	);
}
