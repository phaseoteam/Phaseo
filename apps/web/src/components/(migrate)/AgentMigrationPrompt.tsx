"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslations } from "next-intl";

const SKILL_URL =
	"https://github.com/phaseoteam/Phaseo/blob/main/.agents/skills/openrouter-to-phaseo-migration/SKILL.md";

export const OPENROUTER_AGENT_PROMPT = `Read and follow the Phaseo OpenRouter migration skill before editing:
${SKILL_URL}

Hard-cut this repository from OpenRouter to Phaseo Gateway. Make the changes. Do not stop after an audit or return only a migration plan.

Use the skill for inventory, model checks, behavior mapping, and validation. For this task, the hard cutover overrides its staged-rollout advice. Do not leave a dual-gateway switch, OpenRouter fallback, compatibility environment variable, or dormant OpenRouter client behind.

Find openrouter.ai, OPENROUTER_API_KEY, sk-or-v1, HTTP-Referer, X-Title, OpenRouter packages, provider options, model variants, and response fields across runtime code, tests, deployment config, secret references, examples, and user-facing docs. Replace the gateway boundary with https://api.phaseo.app/v1 and PHASEO_API_KEY. Preserve existing request, streaming, tool-calling, structured-output, and error behavior where Phaseo supports it.

Check every production model against /v1/models. Keep provider-prefixed ids when they are valid. Put required aliases and OpenRouter-only response handling in one boundary adapter. Translate supported routing controls deliberately. If Phaseo cannot match a behavior, fail clearly and record the gap instead of guessing or silently dropping it.

Remove OpenRouter runtime dependencies and obsolete configuration once callers use Phaseo. Never commit, print, or expose secret values. Do not make live provider calls unless suitable credentials are already available and the repository's test policy permits them.

Run the narrowest relevant tests while editing, then run the repository's normal quality gates. When credentials are available, verify /v1/health, /v1/models, one non-streaming request, one streaming request, and one invalid-key or invalid-model failure. If a live check cannot run, say exactly why and leave the command ready to execute.

Finish with the changed files, old-to-new credential names, model mappings, removed OpenRouter dependencies, test evidence, live-check evidence, remaining parity gaps, and a patch-level rollback procedure. The migration is complete only when no active runtime or deployment path still depends on OpenRouter.`;

export function AgentMigrationPrompt() {
	const t = useTranslations("Content.migrate.agentPrompt");
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timeout = window.setTimeout(() => setCopied(false), 2000);
		return () => window.clearTimeout(timeout);
	}, [copied]);

	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(OPENROUTER_AGENT_PROMPT);
			setCopied(true);
		} catch {
			setCopied(false);
		}
	}

	return (
		<aside
			aria-labelledby="agent-migration-prompt-title"
			className="rounded-md border border-primary/25 bg-primary/5 p-5 sm:p-6"
		>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="max-w-2xl">
					<p className="text-sm font-medium text-primary">{t("codingAgents")}</p>
					<h2
						id="agent-migration-prompt-title"
						className="mt-1 text-xl font-semibold tracking-tight"
					>
						{t("title")}
					</h2>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">
						{t("description")}
					</p>
				</div>
				<Button
					type="button"
					className="rounded-md"
					variant="outline"
					onClick={() => void copyPrompt()}
				>
					{copied ? <Check /> : <Copy />}
					{copied ? t("copied") : t("copyPrompt")}
				</Button>
			</div>

			<ScrollArea
				className="mt-5 h-72 rounded-md border border-border/70 bg-background"
				keepScrollbarMounted
				viewportClassName="p-4"
			>
				<pre className="whitespace-pre-wrap text-sm leading-6 text-foreground">
					<code>{OPENROUTER_AGENT_PROMPT}</code>
				</pre>
			</ScrollArea>

			<a
				href={SKILL_URL}
				target="_blank"
				rel="noopener noreferrer"
				className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
			>
				{t("readSkill")}
				<ExternalLink className="size-3.5" />
			</a>
		</aside>
	);
}
