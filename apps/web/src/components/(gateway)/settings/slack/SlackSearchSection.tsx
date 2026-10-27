"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateSlackAgent } from "@/app/(dashboard)/settings/slack/actions";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { Choice, Section, SlackError } from "./SlackAgentFields";
import { SLACK_SEARCH_MODES, slackErrorKey, type SlackErrorKey, type SlackSearchMode } from "./slackAgentForm";

const HELP: Record<SlackSearchMode, "offHelp" | "dmHelp" | "dmAndChannelsHelp"> = { off: "offHelp", dm: "dmHelp", dm_and_channels: "dmAndChannelsHelp" };
const LABEL: Record<SlackSearchMode, "off" | "dm" | "dmAndChannels"> = { off: "off", dm: "dm", dm_and_channels: "dmAndChannels" };

/**
 * Where the agent may search Slack for the person asking, saved as soon as it
 * changes. Direct messages by default: in a channel, everyone reads the answer.
 * `granted`: Slack gave the installation the search scope; until then, the
 * agent can't search, and the section says to update the Slack permissions.
 */
export function SlackSearchSection({ initial, granted }: { initial: SlackSearchMode; granted: boolean }) {
	const t = useTranslations("SettingsUI.slack");
	const write = useSettingsWrite();
	const [mode, setMode] = useState<SlackSearchMode>(initial);
	const [error, setError] = useState<{ key: SlackErrorKey; message?: string | null } | null>(null);
	const [saving, startSaving] = useTransition();

	function change(next: SlackSearchMode) {
		setError(null);
		startSaving(async () => {
			const result = await write(updateSlackAgent({ search_mode: next }));
			if (!result.ok) {
				setError({ key: slackErrorKey(result.code, result.status), message: result.message });
				return;
			}
			setMode(result.installation.settings.search_mode ?? next);
			toast.success(t("search.saved"));
		});
	}

	return (
		<Section title={t("search.title")} description={t("search.description")}>
			<div className="space-y-2">
				<Choice<SlackSearchMode>
					label={t("search.title")}
					value={mode}
					disabled={saving}
					options={SLACK_SEARCH_MODES.map((value) => ({ value, label: t(`search.${LABEL[value]}`) }))}
					onChange={change}
				/>
				<p className="text-xs text-muted-foreground">{t(`search.${HELP[mode]}`)}</p>
				{!granted && mode !== "off" ? <p className="text-xs text-muted-foreground">{t("search.needsPermissions")}</p> : null}
			</div>
			{error ? <SlackError error={error} /> : null}
		</Section>
	);
}
