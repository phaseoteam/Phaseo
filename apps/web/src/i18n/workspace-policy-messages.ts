import type { WorkspacePolicyBlockedReason } from "@/lib/chat/effectivePolicy";

type Translator = { (key: never, values?: never): string };

export function localizedWorkspacePolicyReason(t: Translator, reason: WorkspacePolicyBlockedReason): string {
	if (reason.source === "workspace") return t("blockedByWorkspace" as never);
	const name = reason.guardrailName ?? reason.label.replace(/^Blocked by /, "");
	return t("blockedByGuardrail" as never, {name} as never);
}
