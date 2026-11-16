import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type SandboxStatus = { configured: boolean } | null;

// Admin-only. The route answers 404 to everyone else, so non-admins never see this card.
async function fetchSandboxStatus(): Promise<SandboxStatus> {
	const response = await fetch("/api/stripe/sandbox-checkout", { credentials: "same-origin" });
	if (!response.ok) return null;
	return (await response.json()) as SandboxStatus;
}

export default function StripeSandboxTestCard({ result }: { result: string | null }) {
	const t = useTranslations("SettingsUI");
	const status = useQuery({ queryKey: ["stripe-sandbox-status"], queryFn: fetchSandboxStatus, staleTime: 60_000, retry: false });
	const [opening, setOpening] = useState(false);
	const [failed, setFailed] = useState(false);

	if (!status.data) return null;

	async function openSandboxCheckout() {
		setOpening(true);
		setFailed(false);
		try {
			const response = await fetch("/api/stripe/sandbox-checkout", { method: "POST", credentials: "same-origin" });
			const body = (await response.json().catch(() => null)) as { url?: string } | null;
			if (!response.ok || !body?.url) throw new Error("sandbox_checkout_failed");
			window.location.assign(body.url);
		} catch {
			setFailed(true);
			setOpening(false);
		}
	}

	return (
		<Alert>
			<FlaskConical />
			<AlertTitle>{t("billingCopy.sandboxTest.title")}</AlertTitle>
			<AlertDescription className="space-y-3">
				<p>{t("billingCopy.sandboxTest.description")}</p>
				{result === "success" ? <p>{t("billingCopy.sandboxTest.success")}</p> : null}
				{result === "cancelled" ? <p>{t("billingCopy.sandboxTest.cancelled")}</p> : null}
				{!status.data.configured ? <p>{t("billingCopy.sandboxTest.notConfigured")}</p> : null}
				{failed ? <p className="text-destructive">{t("billingCopy.sandboxTest.failed")}</p> : null}
				<Button size="sm" variant="outline" disabled={!status.data.configured || opening} onClick={openSandboxCheckout}>
					{opening ? t("billingCopy.sandboxTest.opening") : t("billingCopy.sandboxTest.button")}
				</Button>
			</AlertDescription>
		</Alert>
	);
}
