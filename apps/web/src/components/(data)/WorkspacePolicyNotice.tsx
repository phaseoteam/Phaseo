import { Link } from "@/i18n/navigation";
import { useTranslations } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { localizedWorkspacePolicyReason } from "@/i18n/workspace-policy-messages";
import { ShieldBan } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getWorkspacePolicyBlockedReasons } from "@/lib/chat/effectivePolicy";
import { catalogueChatEffectivePolicyQuery } from "./catalogueViewer.functions";

export default function WorkspacePolicyNotice({ kind, id }: { kind: "model" | "provider"; id: string }) {
	const t = useTranslations("Common.ui.localisationGaps");
	const { data: policy } = useSuspenseQuery(catalogueChatEffectivePolicyQuery());
	const reasons = getWorkspacePolicyBlockedReasons(policy, kind === "model" ? { modelIds: [id] } : { providerIds: [id] });
	if (!reasons.length) return null;
	return <Alert className="mb-6 border-destructive/40 bg-destructive/5">
		<ShieldBan className="size-4 text-destructive" />
		<AlertTitle>{t("workspaceBlocked")}</AlertTitle>
		<AlertDescription>
			{t(kind === "model" ? "modelBlocked" : "providerBlocked")}{" "}
			{reasons.map((reason, index) => <span key={`${reason.source}:${reason.settingsHref}`}>
				{index > 0 ? " · " : ""}<Link href={reason.settingsHref} className="font-medium text-foreground underline underline-offset-4">{localizedWorkspacePolicyReason(t, reason)}</Link>
			</span>)}
		</AlertDescription>
	</Alert>;
}
