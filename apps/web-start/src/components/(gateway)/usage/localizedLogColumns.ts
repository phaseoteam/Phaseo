"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { TableColumnDefinition } from "./tablePreferences";

export function useLocalizedLogColumns<Id extends string>(definitions: readonly TableColumnDefinition<Id>[]) {
	const t = useTranslations("SettingsUI");
	return useMemo(() => {
		const copy: Record<string, string> = {
			"Held": t("realtimeCopy.held"),
			"Final Provider": t("realtimeCopy.finalProvider"),
			"Status Code": t("realtimeCopy.statusCode"),
			"Primary Model": t("realtimeCopy.primaryModel"),
			"Primary Provider": t("realtimeCopy.primaryProvider"),
			"Other Models": t("realtimeCopy.otherModels"),
			"Gateway time to first token for streaming, or completion for non-streaming. Includes routing and retries; unavailable when not recorded.": t("realtimeCopy.latencyHelp"),
			"Most-used model by request count in the selected period. Ties use model ID order.": t("realtimeCopy.primaryModelHelp"),
			"Most-used provider for the primary model in the selected period.": t("realtimeCopy.primaryProviderHelp"),
			"Session start time in UTC.": t("realtimeCopy.utcStartHelp"),
			"Charged": t("realtimeCopy.copyCharged"),
			"Provider": t("realtimeCopy.copyProvider"),
			"Duration": t("realtimeCopy.copyDuration"),
			"Date": t("realtimeCopy.copyDate"),
			"Model": t("realtimeCopy.copyModel"),
			"Generation ID": t("realtimeCopy.copyGenerationID"),
			"Attempts": t("realtimeCopy.copyAttempts"),
			"Latency": t("realtimeCopy.copyLatency"),
			"Session ID": t("realtimeCopy.copySessionID"),
			"App": t("realtimeCopy.copyApp"),
			"Requests": t("realtimeCopy.copyRequests"),
			"Cost": t("realtimeCopy.copyCost"),
			"Status": t("realtimeCopy.copyStatus"),
			"Voice": t("realtimeCopy.copyVoice"),
		};
		return definitions.map(column => ({ ...column, label: copy[column.label] ?? column.label, ...(column.description ? { description: copy[column.description] ?? column.description } : {}) }));
	}, [definitions, t]);
}
