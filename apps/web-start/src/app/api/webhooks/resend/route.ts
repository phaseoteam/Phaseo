import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/utils/supabase/admin";
import { readBoundedTextBody } from "@/lib/server/boundedRequestBody";
import {
	extractResendRecipient,
	hashRecipientEmail,
	resendSuppressionReason,
	type ResendWebhookPayload,
} from "@/lib/email/resend-webhooks";

export async function POST(request: Request) {
	const webhookSecret = String(process.env.RESEND_WEBHOOK_SECRET ?? "").trim();
	if (!webhookSecret) {
		return NextResponse.json({ error: "resend_webhook_not_configured" }, { status: 503 });
	}

	const id = request.headers.get("svix-id");
	const timestamp = request.headers.get("svix-timestamp");
	const signature = request.headers.get("svix-signature");
	if (!id || !timestamp || !signature) {
		return NextResponse.json({ error: "invalid_resend_webhook" }, { status: 400 });
	}

	const bodyResult = await readBoundedTextBody(request, 256 * 1024);
	if (!bodyResult.ok) {
		return NextResponse.json({ error: "resend_webhook_body_too_large" }, { status: 413 });
	}
	const rawBody = bodyResult.text;
	let payload: ResendWebhookPayload;
	try {
		const resend = new Resend(String(process.env.RESEND_API_KEY ?? "re_webhook_verification"));
		payload = resend.webhooks.verify({
			payload: rawBody,
			headers: { id, timestamp, signature },
			webhookSecret,
		}) as ResendWebhookPayload;
	} catch {
		return NextResponse.json({ error: "invalid_resend_webhook" }, { status: 400 });
	}

	try {
		const eventType = String(payload.type ?? "").trim();
		if (!eventType) throw new Error("missing_resend_event_type");

		const recipient = extractResendRecipient(payload);
		const recipientHash = recipient ? await hashRecipientEmail(recipient) : null;
		const emailId = typeof payload.data?.email_id === "string" ? payload.data.email_id : null;
		const eventCreatedAt = typeof payload.created_at === "string" ? payload.created_at : null;
		const supabase = createAdminClient();
		const eventResult = await supabase.from("resend_webhook_events").upsert({
			id,
			event_type: eventType,
			email_id: emailId,
			recipient_email_hash: recipientHash,
			event_created_at: eventCreatedAt,
		}, { onConflict: "id", ignoreDuplicates: true });
		if (eventResult.error) throw eventResult.error;

		const reason = resendSuppressionReason(eventType);
		if (reason && recipientHash) {
			const suppressionResult = await supabase.from("email_delivery_suppressions").upsert({
				recipient_email_hash: recipientHash,
				reason,
				source_event_id: id,
				updated_at: new Date().toISOString(),
			}, { onConflict: "recipient_email_hash" });
			if (suppressionResult.error) throw suppressionResult.error;
		}

		return NextResponse.json({ received: true });
	} catch (error) {
		console.error("resend_webhook_failed", {
			id,
			error: error instanceof Error ? error.message : String(error),
		});
		return NextResponse.json({ error: "resend_webhook_processing_failed" }, { status: 500 });
	}
}
