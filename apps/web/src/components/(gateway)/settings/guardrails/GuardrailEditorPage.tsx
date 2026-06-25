import Link from "next/link";
import { fetchSettingsGuardrailEditorData } from "@/lib/fetchers/internal/fetchSettingsGuardrailEditorData";
import GuardrailEditorPageClient from "./GuardrailEditorPageClient";

export default async function GuardrailEditorPage(props: {
	mode: "create" | "edit";
	guardrailId?: string;
}) {
	const data = await fetchSettingsGuardrailEditorData(
		props.mode,
		props.guardrailId,
	);

	if (!data.workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a workspace to manage guardrails.
			</div>
		);
	}

	if (props.mode === "edit" && !data.guardrail) {
		return (
			<div className="rounded-xl border bg-muted/10 p-6 text-sm text-muted-foreground">
				Guardrail not found.{" "}
				<Link className="underline underline-offset-4" href="/settings/guardrails">
					Back to guardrails
				</Link>
				.
			</div>
		);
	}

	return (
		<GuardrailEditorPageClient
			mode={props.mode}
			guardrailId={props.guardrailId ?? null}
			teamName={data.teamName}
			providers={data.providers}
			activeProviderModels={data.activeProviderModels}
			keys={data.keys}
			initialGuardrail={data.guardrail}
			initialKeyIds={data.initialKeyIds}
			backHref="/settings/guardrails"
		/>
	);
}

