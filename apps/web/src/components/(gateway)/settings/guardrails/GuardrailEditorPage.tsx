"use client";
import Link from "next/link";
import type { SettingsGuardrailEditorData } from "@/lib/fetchers/internal/settingsTypes";
import { PrivateSettingsQuery } from "../PrivateSettingsQuery";
import GuardrailEditorPageClient from "./GuardrailEditorPageClient";

export default function GuardrailEditorPage(props: {
	mode: "create" | "edit";
	guardrailId?: string;
}) {
	const params = new URLSearchParams({ mode: props.mode });
	if (props.guardrailId) params.set("guardrailId", props.guardrailId);
	return <PrivateSettingsQuery<SettingsGuardrailEditorData> path={`/api/account/settings/guardrails/editor?${params}`}>{(data) => <GuardrailEditorContent {...props} data={data} />}</PrivateSettingsQuery>;
}

function GuardrailEditorContent(props: { mode: "create" | "edit"; guardrailId?: string; data: SettingsGuardrailEditorData }) {
	const { data } = props;

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

	if (!data.canManageGuardrails) {
		return (
			<div className="rounded-xl border bg-muted/10 p-6 text-sm text-muted-foreground">
				Only workspace owners and admins can change guardrails. Assigned policies are enforced automatically for members.
			</div>
		);
	}

	return (
		<GuardrailEditorPageClient
			accountPolicy={data.accountPolicy}
			mode={props.mode}
			guardrailId={props.guardrailId ?? null}
			teamName={data.teamName}
			providers={data.providers}
			activeProviderModels={data.activeProviderModels}
			keys={data.keys}
			members={data.members}
			initialGuardrail={data.guardrail}
			initialKeyIds={data.initialKeyIds}
			initialMemberIds={data.initialMemberIds}
			backHref="/settings/guardrails"
		/>
	);
}
