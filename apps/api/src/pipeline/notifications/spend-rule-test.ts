// Spend rule test sends, shared by the control API (POST /v1/control/spend-rules/{id}/test)
// and the settings page (web-api calls /internal/notification-tests/spend-rule).
//
// A test renders the rule's alert from its current value with the evaluator's own SQL
// (public.preview_workspace_spend_rule), marks it TEST, and delivers it now through the
// notification test path to the rule's destinations, or to the workspace's spend_alert routes
// when the rule has none. Nothing is written except the limiter's per-minute counter: no
// email_outbox row, no rule state, no push. At most SPEND_RULE_TEST_SENDS_PER_MINUTE (5) tests
// per workspace per minute, counted in the database so both entry points share the allowance.
import { getSupabaseAdmin } from "@/runtime/env";
import { deliverNotificationTest } from "@/pipeline/notifications/notification-delivery";
import {
	SPEND_RULE_TEST_SENDS_PER_MINUTE,
	embeddedDestinationIds,
	formatSpendRulePreview,
	type SpendRuleTestDelivery,
	type SpendRuleTestResult,
} from "@/core/spend-rules";

export class SpendRuleTestError extends Error {
	constructor(
		readonly status: 404 | 409 | 429 | 503,
		readonly code: string,
		message: string,
		readonly retryAfterSeconds?: number,
	) {
		super(message);
	}
}

type DestinationRow = { id: string; name: string | null; type: string; status: string };

const TEST_NOTE = "This is a test: nothing was recorded and the rule's thresholds are unchanged.";

/** Seconds until the limiter's next minute starts (1-60). */
export function secondsToNextMinute(now = new Date()): number {
	return 60 - now.getUTCSeconds();
}

export async function sendSpendRuleTest(input: { workspaceId: string; ruleId: string; now?: Date }): Promise<SpendRuleTestResult> {
	const supabase = getSupabaseAdmin();
	const now = input.now ?? new Date();
	const ruleResult = await supabase.from("workspace_spend_rules")
		.select("id,name,metric,workspace_spend_rule_destinations(destination_id)")
		.eq("workspace_id", input.workspaceId).eq("id", input.ruleId).is("deleted_at", null)
		.maybeSingle();
	if (ruleResult.error) throw new SpendRuleTestError(503, "spend_rule_test_unavailable", "Phaseo could not load the spend rule");
	if (!ruleResult.data) throw new SpendRuleTestError(404, "not_found", "Spend rule not found");
	const rule = ruleResult.data as { id: string; name: string; metric: string; workspace_spend_rule_destinations?: unknown };

	const allowance = await supabase.rpc("consume_spend_rule_test_send", {
		p_workspace_id: input.workspaceId,
		p_limit: SPEND_RULE_TEST_SENDS_PER_MINUTE,
	});
	if (allowance.error) throw new SpendRuleTestError(503, "spend_rule_test_unavailable", "Phaseo could not check the test send limit");
	if (allowance.data !== true) {
		throw new SpendRuleTestError(429, "rate_limited", `A workspace can send at most ${SPEND_RULE_TEST_SENDS_PER_MINUTE} spend rule tests a minute`, secondsToNextMinute(now));
	}

	const previewResult = await supabase.rpc("preview_workspace_spend_rule", {
		p_workspace_id: input.workspaceId,
		p_rule_id: rule.id,
		p_now: now.toISOString(),
	});
	if (previewResult.error) {
		if (previewResult.error.message?.includes("spend_rule_not_found")) throw new SpendRuleTestError(404, "not_found", "Spend rule not found");
		throw new SpendRuleTestError(503, "spend_rule_test_unavailable", "Phaseo could not compute the spend rule");
	}
	const preview = formatSpendRulePreview((previewResult.data ?? {}) as Record<string, unknown>);

	const ruleDestinations = embeddedDestinationIds(rule);
	let source: SpendRuleTestResult["source"] = "rule";
	let destinationIds = ruleDestinations;
	if (!destinationIds.length) {
		source = "routes";
		const routes = await supabase.from("notification_event_destinations").select("destination_id")
			.eq("workspace_id", input.workspaceId).eq("event_kind", "spend_alert");
		if (routes.error) throw new SpendRuleTestError(503, "spend_rule_test_unavailable", "Phaseo could not load the spend alert routes");
		destinationIds = (routes.data ?? []).map((row: { destination_id: unknown }) => String(row.destination_id));
	}
	if (!destinationIds.length) {
		throw new SpendRuleTestError(409, "no_notification_destinations", "The rule has no destinations and Spend Alerts are not routed anywhere. Add a destination to the rule or route Spend Alerts in notification settings.");
	}
	const destinationsResult = await supabase.from("notification_destinations").select("id,name,type,status")
		.eq("workspace_id", input.workspaceId).eq("status", "active").in("id", destinationIds);
	if (destinationsResult.error) throw new SpendRuleTestError(503, "spend_rule_test_unavailable", "Phaseo could not load the destinations");
	const destinations = (destinationsResult.data ?? []) as DestinationRow[];
	// As the evaluator does, a rule whose own destinations are all paused does not fall back to the routes.
	if (!destinations.length) {
		throw new SpendRuleTestError(409, "no_active_destinations", source === "rule"
			? "None of the rule's destinations is active"
			: "None of the destinations Spend Alerts are routed to is active");
	}

	const title = `[TEST] ${preview.alert?.title ?? `${rule.name}: test alert`}`;
	const message = preview.alert
		? `${preview.alert.message} ${TEST_NOTE}`
		: !preview.evaluated
			? `This is a test of spend rule "${rule.name}". ${rule.metric} rules are evaluated from a later release, so this rule does not send alerts yet.`
			: `This is a test of spend rule "${rule.name}". Its base is not set (a missing budget or key limit), so it cannot fire until it is. ${TEST_NOTE}`;
	const payload = {
		test: true,
		title,
		message,
		rule_id: rule.id,
		rule_name: rule.name,
		metric: rule.metric,
		period: preview.period ? { ...preview.period, time_zone: preview.time_zone } : null,
		value_nanos: preview.value_nanos,
		base_kind: preview.base_kind,
		base_nanos: preview.base_nanos,
		percent: preview.percent,
		threshold_percent: preview.reached_threshold_percent,
		threshold_percents: preview.threshold_percents,
		threshold_amount_nanos: preview.threshold_amount_nanos,
		evaluated_at: preview.computed_at,
		url: "https://phaseo.app/settings/notifications",
	};

	const settled = await Promise.allSettled(destinations.map((destination) => deliverNotificationTest({
		workspaceId: input.workspaceId,
		destinationId: destination.id,
		event: { kind: "spend_alert", subject: title, payload },
	})));
	const deliveries: SpendRuleTestDelivery[] = destinations.map((destination, index) => {
		const outcome = settled[index];
		// 208: an email destination whose recipients are all suppressed, so nothing was sent.
		const suppressed = outcome.status === "fulfilled" && outcome.value === 208;
		return {
			destination_id: destination.id,
			name: String(destination.name ?? ""),
			type: destination.type,
			delivered: outcome.status === "fulfilled" && !suppressed,
			status: outcome.status === "fulfilled" ? outcome.value : null,
			error: outcome.status === "rejected"
				? String(outcome.reason instanceof Error ? outcome.reason.message : outcome.reason).slice(0, 300)
				: suppressed ? "Every recipient of this email destination is suppressed" : null,
		};
	});
	const delivered = deliveries.filter((delivery) => delivery.delivered).length;
	return { rule_id: rule.id, rule_name: rule.name, test: true, title, message, source, delivered, failed: deliveries.length - delivered, deliveries };
}
