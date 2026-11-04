import { Link } from "@/i18n/navigation";
import { useTranslations } from "@/i18n/react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import GuardrailsSettingsClient from "@/components/(gateway)/settings/guardrails/GuardrailsSettingsClient";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsGuardrailsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Shield } from "lucide-react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GuardrailAssignmentsPanel from "@/components/(gateway)/settings/guardrails/GuardrailAssignmentsPanel";
import { parseAsStringLiteral, useQueryState } from "nuqs";

export default withSettingsResource("guardrails", function GuardrailsContent({ initialData }: { initialData: SettingsGuardrailsInitialData }) {
	const t = useTranslations("SettingsUI");
	const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(["guardrails", "assignments"] as const).withDefault("guardrails"));
	const header = (
		<SettingsPageHeader
			title={t("headers.guardrails")}
			description={t("headers.guardrailsDescription")}
			meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>}
			actions={(
				<>
					{initialData.canManageGuardrails ? <Button asChild type="button" className="rounded-md">
						<Link href="/settings/guardrails/new">
							<Plus className="h-4 w-4" />
							{t("settingsPageCopy.guardrailNew")}
						</Link>
					</Button> : null}
					<ProductFeedbackButton
						surface="settings_guardrails"
						prompt={t("settingsPageCopy.guardrailFeedback")}
					/>
				</>
			)}
		/>
	);

	if (!initialData.workspaceId) {
		return (
			<div className="space-y-6">
				{header}
				<Empty className="rounded-xl border border-dashed border-border/80 p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Shield className="h-5 w-5" />
					</EmptyMedia>
					<EmptyTitle>{t("settingsCopy.guardrails.selectWorkspace")}</EmptyTitle>
					<EmptyDescription>
						{t("settingsPageCopy.guardrailsWorkspaceBody")}
					</EmptyDescription>
				</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{header}
			<Tabs value={tab} onValueChange={(value) => void setTab(value === "assignments" ? "assignments" : null)} className="gap-4">
				<TabsList variant="line" className="w-full justify-start border-b">
					<TabsTrigger value="guardrails">{t("guardrailAssignments.tabGuardrails")}</TabsTrigger>
					<TabsTrigger value="assignments">{t("guardrailAssignments.tabAssignments")}</TabsTrigger>
				</TabsList>
				<TabsContent value="guardrails">
					<GuardrailsSettingsClient
						canManageGuardrails={initialData.canManageGuardrails}
						providers={initialData.providers}
						activeProviderModels={initialData.activeProviderModels}
						keys={initialData.keys}
						guardrails={initialData.guardrails}
						guardrailKeyIdsByGuardrailId={initialData.guardrailKeyIdsByGuardrailId}
						guardrailMemberIdsByGuardrailId={initialData.guardrailMemberIdsByGuardrailId}
					/>
				</TabsContent>
				<TabsContent value="assignments">
					<GuardrailAssignmentsPanel
						workspaceId={initialData.workspaceId}
						canManageGuardrails={initialData.canManageGuardrails}
						guardrails={initialData.guardrails}
						keys={initialData.keys}
						members={initialData.members}
						guardrailKeyIdsByGuardrailId={initialData.guardrailKeyIdsByGuardrailId}
						guardrailMemberIdsByGuardrailId={initialData.guardrailMemberIdsByGuardrailId}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
});
