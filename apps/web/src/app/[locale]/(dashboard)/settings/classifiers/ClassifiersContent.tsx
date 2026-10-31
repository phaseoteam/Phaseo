"use client";
import { Plus } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { Link } from "@/i18n/navigation";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import ClassifiersSettingsClient from "@/components/(gateway)/settings/classifiers/ClassifiersSettingsClient";
import type { SettingsClassifiersInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";

export default withSettingsResource("classifiers", function ClassifiersContent({ initialData }: { initialData: SettingsClassifiersInitialData }) {
	const t = useTranslations("SettingsUI");
	const atLimit = initialData.classifiers.length >= initialData.limit;
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={t("classifiers.title")}
				description={t("classifiers.description")}
				meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>}
				actions={(
					<>
						{initialData.workspaceId && initialData.canManageClassifiers ? (atLimit ? (
							<Button type="button" className="rounded-md" disabled title={t("classifiers.limitReached", { limit: initialData.limit })}>
								<Plus className="h-4 w-4" />
								{t("classifiers.newClassifier")}
							</Button>
						) : (
							<Button asChild type="button" className="rounded-md">
								<Link href="/settings/classifiers/new">
									<Plus className="h-4 w-4" />
									{t("classifiers.newClassifier")}
								</Link>
							</Button>
						)) : null}
						<ProductFeedbackButton surface="settings_classifiers" prompt={t("classifiers.feedback")} />
					</>
				)}
			/>
			<ClassifiersSettingsClient data={initialData} />
		</div>
	);
});
