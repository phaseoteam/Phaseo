import { useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { useFormatter, useTranslations } from "@/i18n/react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import {
	approveKeyRequestAction,
	denyKeyRequestAction,
	keyRequestQuery,
	type KeyRequestView,
} from "./keyRequest.functions";

const ROUTE_ID = "/{-$locale}/_dashboard/settings/keys/requests/$requestId/";

export async function getKeyRequestMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI.keyRequests");
	return { title: t("title") };
}

/** US dollars with cents, as everywhere else in Phaseo. */
function usd(nanos: number): string {
	return (nanos / 1_000_000_000).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Viewing the page never changes the request: Approve and Deny are POSTs.
export default function KeyRequestPage() {
	const t = useTranslations("SettingsUI.keyRequests");
	const format = useFormatter();
	const { requestId } = useParams({ from: ROUTE_ID });
	const { data: result } = useSuspenseQuery(keyRequestQuery(requestId));

	const header = <SettingsPageHeader title={t("title")} description={t("description")} />;

	if (result.kind !== "ok") {
		return (
			<div className="space-y-4">
				{header}
				<Callout tone="warning" title={t("notFoundTitle")}>{t("notFoundBody")}</Callout>
			</div>
		);
	}

	const request = result.request;
	const dateTime = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
	const details: Array<[string, string]> = [
		[t("requestedBy"), request.clientName],
		[t("workspace"), request.workspaceName],
		[t("keyName"), request.keyName],
		[t("dailyLimit"), request.dailyCostNanos > 0 ? usd(request.dailyCostNanos) : t("noLimit")],
		[t("monthlyLimit"), request.monthlyCostNanos > 0 ? usd(request.monthlyCostNanos) : t("noLimit")],
		[t("keyExpires"), t("keyLifetime", { days: request.keyLifetimeDays })],
		[t("requestedAt"), dateTime(request.createdAt)],
		[t("requestExpires"), dateTime(request.expiresAt)],
	];

	return (
		<div className="space-y-4">
			{header}
			<Card className="rounded-md">
				<CardContent className="p-0">
					<dl className="divide-y">
						{details.map(([label, value]) => (
							<div key={label} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
								<dt className="text-sm text-muted-foreground">{label}</dt>
								<dd className="text-sm font-medium tabular-nums break-words sm:text-right">{value}</dd>
							</div>
						))}
					</dl>
				</CardContent>
			</Card>
			<KeyRequestDecision request={request} />
		</div>
	);
}

function KeyRequestDecision({ request }: { request: KeyRequestView }) {
	const t = useTranslations("SettingsUI.keyRequests");
	const queryClient = useQueryClient();
	const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
	const [error, setError] = useState<string | null>(null);

	if (request.status === "approved" || request.status === "collected") {
		return <Callout tone="success" title={t("approvedTitle")}>{t("approvedBody")}</Callout>;
	}
	if (request.status === "denied") {
		return <Callout tone="info" title={t("deniedTitle")}>{t("deniedBody")}</Callout>;
	}
	if (request.status === "expired") {
		return <Callout tone="warning" title={t("expiredTitle")}>{t("expiredBody")}</Callout>;
	}
	if (request.status === "approving") {
		return <Callout tone="info" title={t("approvingTitle")}>{t("approvingBody")}</Callout>;
	}
	if (!request.canApprove) {
		return <Callout tone="warning" title={t("forbiddenTitle")}>{t("forbiddenBody")}</Callout>;
	}

	const errorMessage = (code: string) => {
		if (code === "key_limit_reached") return t("keyLimitReached");
		if (code === "request_changed") return t("requestChanged");
		if (code === "not_pending") return t("notPending");
		return t("genericError");
	};

	async function decide(action: "approve" | "deny") {
		setBusy(action);
		setError(null);
		try {
			const outcome = action === "approve"
				? await approveKeyRequestAction({ data: { id: request.id, shown: { keyName: request.keyName, dailyCostNanos: request.dailyCostNanos, monthlyCostNanos: request.monthlyCostNanos, keyLifetimeDays: request.keyLifetimeDays } } })
				: await denyKeyRequestAction({ data: { id: request.id } });
			if (!outcome.ok) setError(errorMessage(outcome.error));
			await queryClient.invalidateQueries({ queryKey: keyRequestQuery(request.id).queryKey });
		} catch {
			setError(t("genericError"));
		} finally {
			setBusy(null);
		}
	}

	return (
		<div className="space-y-4">
			<Callout tone={request.phaseoApp ? "info" : "warning"} title={request.phaseoApp ? t("phaseoAppTitle") : t("otherAppTitle", { app: request.clientName })}>
				{request.phaseoApp ? t("phaseoAppBody") : t("otherAppBody", { app: request.clientName })}
			</Callout>
			{error ? <Callout tone="critical" title={t("errorTitle")}>{error}</Callout> : null}
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button variant="outline" disabled={busy !== null} onClick={() => decide("deny")}>
					{t("deny")}
				</Button>
				<Button disabled={busy !== null} onClick={() => decide("approve")}>
					{busy === "approve" ? t("approving") : t("approve")}
				</Button>
			</div>
		</div>
	);
}
