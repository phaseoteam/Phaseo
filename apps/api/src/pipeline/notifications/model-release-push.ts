import { getSupabaseAdmin } from "@/runtime/env";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

type PushAttempt = {
	id: string;
	device_id: string;
	mobile_push_devices: { expo_push_token: string } | Array<{ expo_push_token: string }> | null;
};

type ExpoTicket = { status: "ok"; id: string } | { status: "error"; message?: string; details?: { error?: string } };

export function modelReleasePushMessage(event: { model_slug: string; model_name: string; lab_name: string }) {
	return {
		title: `${event.lab_name} released ${event.model_name}`,
		body: `See model details, availability, pricing and benchmarks in Phaseo.`,
		data: { type: "model_release", modelId: event.model_slug, href: `/model/${encodeURIComponent(event.model_slug)}` },
		sound: "default" as const,
		channelId: "model-releases",
	};
}

function deviceToken(attempt: PushAttempt): string | null {
	const relation = Array.isArray(attempt.mobile_push_devices) ? attempt.mobile_push_devices[0] : attempt.mobile_push_devices;
	return relation?.expo_push_token ?? null;
}

async function sendExpoBatch(messages: Array<Record<string, unknown>>, accessToken?: string): Promise<ExpoTicket[]> {
	const response = await fetch(EXPO_PUSH_URL, {
		method: "POST",
		headers: {
			accept: "application/json",
			"content-type": "application/json",
			...(accessToken?.trim() ? { authorization: `Bearer ${accessToken.trim()}` } : {}),
		},
		body: JSON.stringify(messages),
	});
	if (!response.ok) throw new Error(`expo_push_http_${response.status}`);
	const payload = await response.json() as { data?: ExpoTicket[] };
	if (!Array.isArray(payload.data) || payload.data.length !== messages.length) throw new Error("expo_push_invalid_response");
	return payload.data;
}

export async function runModelReleasePushJob(args: { limit?: number; expoAccessToken?: string } = {}): Promise<{ events: number; sent: number; failed: number }> {
	const supabase = getSupabaseAdmin();
	const now = new Date().toISOString();
	const eventsResult = await supabase.from("model_release_push_events")
		.select("id,model_slug,model_name,lab_name,attempts")
		.in("status", ["pending", "processing"])
		.lte("next_attempt_at", now)
		.order("created_at", { ascending: true })
		.limit(args.limit ?? 5);
	if (eventsResult.error) throw new Error(`model_release_push_events_fetch_failed:${eventsResult.error.message}`);

	let sent = 0;
	let failed = 0;
	for (const event of eventsResult.data ?? []) {
		await supabase.from("model_release_push_events").update({ status: "processing", updated_at: now }).eq("id", event.id);
		try {
			const preferences = await supabase.from("mobile_notification_preferences").select("user_id").eq("new_model_releases_enabled", true).limit(10000);
			if (preferences.error) throw new Error(`model_release_push_preferences_fetch_failed:${preferences.error.message}`);
			const userIds = (preferences.data ?? []).map((row) => row.user_id);
			if (userIds.length) {
				const devices = await supabase.from("mobile_push_devices").select("id").in("user_id", userIds).eq("status", "active").limit(10000);
				if (devices.error) throw new Error(`model_release_push_devices_fetch_failed:${devices.error.message}`);
				const rows = (devices.data ?? []).map((device) => ({ event_id: event.id, device_id: device.id, status: "pending" }));
				if (rows.length) {
					const queued = await supabase.from("model_release_push_attempts").upsert(rows, { onConflict: "event_id,device_id", ignoreDuplicates: true });
					if (queued.error) throw new Error(`model_release_push_attempts_enqueue_failed:${queued.error.message}`);
				}
			}

			const attemptsResult = await supabase.from("model_release_push_attempts")
				.select("id,device_id,mobile_push_devices!inner(expo_push_token)")
				.eq("event_id", event.id).eq("status", "pending").limit(10000);
			if (attemptsResult.error) throw new Error(`model_release_push_attempts_fetch_failed:${attemptsResult.error.message}`);
			const attempts = (attemptsResult.data ?? []) as unknown as PushAttempt[];
			const content = modelReleasePushMessage(event);
			for (let offset = 0; offset < attempts.length; offset += EXPO_BATCH_SIZE) {
				const batch = attempts.slice(offset, offset + EXPO_BATCH_SIZE).filter((attempt) => deviceToken(attempt));
				const tickets = await sendExpoBatch(batch.map((attempt) => ({ to: deviceToken(attempt), ...content })), args.expoAccessToken);
				for (const [index, ticket] of tickets.entries()) {
					const attempt = batch[index];
					if (ticket.status === "ok") {
						await supabase.from("model_release_push_attempts").update({ status: "sent", expo_ticket_id: ticket.id, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", attempt.id);
						sent += 1;
					} else {
						const errorCode = ticket.details?.error ?? "expo_push_error";
						await supabase.from("model_release_push_attempts").update({ status: "failed", error_code: errorCode, error_message: ticket.message ?? null, updated_at: new Date().toISOString() }).eq("id", attempt.id);
						if (errorCode === "DeviceNotRegistered") await supabase.from("mobile_push_devices").update({ status: "invalid", invalidated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", attempt.device_id);
						failed += 1;
					}
				}
			}
			await supabase.from("model_release_push_events").update({ status: "complete", attempts: Number(event.attempts ?? 0) + 1, completed_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", event.id);
		} catch (error) {
			const attemptCount = Number(event.attempts ?? 0) + 1;
			const terminal = attemptCount >= 5;
			await supabase.from("model_release_push_events").update({
				status: terminal ? "failed" : "pending",
				attempts: attemptCount,
				next_attempt_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** attemptCount) * 1000).toISOString(),
				last_error: String(error instanceof Error ? error.message : error).slice(0, 1000),
				updated_at: new Date().toISOString(),
			}).eq("id", event.id);
			failed += 1;
		}
	}
	return { events: eventsResult.data?.length ?? 0, sent, failed };
}
