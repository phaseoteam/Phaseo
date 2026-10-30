"use client";
import { notFound } from "next/navigation";
import { PrivateSettingsQuery } from "../PrivateSettingsQuery";
import WebhooksSettingsClient, { type WebhookEndpoint } from "./WebhooksSettingsClient";
import WebhookEndpointForm from "./WebhookEndpointForm";

export default function CachedWebhooks({ endpointId }: { endpointId?: string }) {
	return <PrivateSettingsQuery<{ endpoints: WebhookEndpoint[] }> path="/api/account/settings/webhooks">{({ endpoints }) => {
		if (!endpointId) return <WebhooksSettingsClient endpoints={endpoints} />;
		const endpoint = endpoints.find((candidate) => candidate.id === decodeURIComponent(endpointId));
		if (!endpoint) notFound();
		return <WebhookEndpointForm mode="edit" initialEndpoint={endpoint} />;
	}}</PrivateSettingsQuery>;
}
