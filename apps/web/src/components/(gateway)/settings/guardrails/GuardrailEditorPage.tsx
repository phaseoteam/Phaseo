import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fetchSettingsGuardrailEditorData } from "@/lib/fetchers/internal/fetchSettingsGuardrailEditorData";
import GuardrailEditorPageClient from "./GuardrailEditorPageClient";

export default async function GuardrailEditorPage(props: {
	mode: "create" | "edit";
	guardrailId?: string;
}) {
	const t = await getTranslations("SettingsUI.settingsCopy.guardrails");
	const data = await fetchSettingsGuardrailEditorData(
		props.mode,
		props.guardrailId,
	);

	if (!data.workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				{t("selectWorkspace")}
			</div>
		);
	}

	if (props.mode === "edit" && !data.guardrail) {
		return (
			<div className="rounded-xl border bg-muted/10 p-6 text-sm text-muted-foreground">
				{t("notFound")}{" "}
				<Link className="underline underline-offset-4" href="/settings/guardrails">
					{t("back")}
				</Link>
				.
			</div>
		);
	}

	if (!data.canManageGuardrails) {
		return (
			<div className="rounded-xl border bg-muted/10 p-6 text-sm text-muted-foreground">
				{t("permissions")}
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

