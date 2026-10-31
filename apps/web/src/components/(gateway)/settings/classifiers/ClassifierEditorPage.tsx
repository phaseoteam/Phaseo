"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import SettingsPageHeader from "../SettingsPageHeader";
import { SettingsResourceQuery } from "../PrivateSettingsQuery";
import ClassifierEditor from "./ClassifierEditor";

export default function ClassifierEditorPage({ mode, classifierId }: { mode: "create" | "edit"; classifierId?: string }) {
	const t = useTranslations("SettingsUI");
	return (
		<div className="space-y-6">
			<Link href="/settings/classifiers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
				<ArrowLeft className="size-4" />{t("classifiers.backToList")}
			</Link>
			<SettingsPageHeader
				title={mode === "create" ? t("classifiers.newTitle") : t("classifiers.editTitle")}
				description={mode === "create" ? t("classifiers.newDescription") : t("classifiers.editDescription")}
				meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>}
			/>
			<SettingsResourceQuery resource="classifiers">
				{(data) => {
					if (!data.workspaceId) return <p className="text-sm text-muted-foreground">{t("classifiers.selectWorkspace")}</p>;
					if (!data.canManageClassifiers) return <p className="text-sm text-muted-foreground">{t("classifiers.adminsOnly")}</p>;
					const classifier = mode === "edit" ? data.classifiers.find((entry) => entry.id === classifierId?.toLowerCase()) ?? null : null;
					if (mode === "edit" && !classifier) return <p className="text-sm text-muted-foreground">{t("classifiers.notFound")}</p>;
					if (mode === "create" && data.classifiers.length >= data.limit) return <p className="text-sm text-muted-foreground">{t("classifiers.limitReached", { limit: data.limit })}</p>;
					return <ClassifierEditor key={classifier?.id ?? "new"} classifier={classifier} keys={data.keys} apps={data.apps} />;
				}}
			</SettingsResourceQuery>
		</div>
	);
}
