import Link from "next/link";
import { ShieldBan } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getWorkspacePolicyBlockedReasons } from "@/lib/chat/effectivePolicy";
import { fetchChatEffectivePolicy } from "@/lib/fetchers/internal/fetchChatEffectivePolicy";

export default async function WorkspacePolicyNotice({ kind, id }: { kind: "model" | "provider"; id: string }) {
	const policy = await fetchChatEffectivePolicy().catch(() => null);
	const reasons = getWorkspacePolicyBlockedReasons(policy, kind === "model" ? { modelIds: [id] } : { providerIds: [id] });
	if (!reasons.length) return null;
	return <Alert className="mb-6 border-destructive/40 bg-destructive/5">
		<ShieldBan className="size-4 text-destructive" />
		<AlertTitle>Blocked in this workspace</AlertTitle>
		<AlertDescription>
			Requests using the selected workspace cannot route to this {kind}.{" "}
			{reasons.map((reason, index) => <span key={`${reason.source}:${reason.settingsHref}`}>
				{index > 0 ? " · " : ""}<Link href={reason.settingsHref} className="font-medium text-foreground underline underline-offset-4">{reason.label}</Link>
			</span>)}
		</AlertDescription>
	</Alert>;
}
