import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import { buildApiModelConflictsSnapshot } from "@/lib/internal/apiModelConflicts";
import ApiModelConflictsClient from "./ApiModelConflictsClient";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.internalTools");
	return {
		title: t("apiModelConflictsTitle"),
		description: t("apiModelConflictsDescription"),
		robots: { index: false, follow: false },
	};
}

export default async function ApiModelConflictsPage() {
	await requireInternalAdmin("/internal");

	const snapshot = buildApiModelConflictsSnapshot();
	return <ApiModelConflictsClient snapshot={snapshot} />;
}
