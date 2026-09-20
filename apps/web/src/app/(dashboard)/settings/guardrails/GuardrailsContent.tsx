"use client";
import Link from "next/link";
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

export default withSettingsResource("guardrails", function GuardrailsContent({ initialData }: { initialData: SettingsGuardrailsInitialData }) {
	const header = (
		<SettingsPageHeader
			title="Guardrails"
			description="Set workspace policies for members and API keys."
			meta={<Badge variant="outline">Beta</Badge>}
			actions={(
				<>
					{initialData.canManageGuardrails ? <Button asChild type="button" className="rounded-md">
						<Link href="/settings/guardrails/new">
							<Plus className="h-4 w-4" />
							New Guardrail
						</Link>
					</Button> : null}
					<ProductFeedbackButton
						surface="settings_guardrails"
						prompt="Tell us what would make Guardrails more useful for your workspace."
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
					<EmptyTitle>Select a workspace</EmptyTitle>
					<EmptyDescription>
						Choose a workspace to view and manage its guardrails.
					</EmptyDescription>
				</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{header}
		<GuardrailsSettingsClient
			canManageGuardrails={initialData.canManageGuardrails}
			providers={initialData.providers}
			activeProviderModels={initialData.activeProviderModels}
			keys={initialData.keys}
			guardrails={initialData.guardrails}
			guardrailKeyIdsByGuardrailId={initialData.guardrailKeyIdsByGuardrailId}
			guardrailMemberIdsByGuardrailId={initialData.guardrailMemberIdsByGuardrailId}
		/>
		</div>
	);
});
