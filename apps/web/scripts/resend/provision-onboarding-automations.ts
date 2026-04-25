#!/usr/bin/env tsx

import {
	Resend,
	type AutomationConnection,
	type AutomationStep,
	type CreateTemplateOptions,
} from "resend";
import {
	RESEND_ONBOARDING_AUTOMATION_NAMES,
	RESEND_ONBOARDING_EVENT_NAMES,
	RESEND_ONBOARDING_TEMPLATE_ALIASES,
} from "../../src/lib/automations/resend-onboarding.constants";

type TemplateSpec = {
	alias: string;
	name: string;
	subject: string;
	replyTo?: string;
	html: string;
	text: string;
};

type AutomationDefinition = {
	name: string;
	steps: AutomationStep[];
	connections: AutomationConnection[];
};

function env(name: string, fallback = ""): string {
	return String(process.env[name] ?? fallback).trim();
}

function requiredEnv(name: string): string {
	const value = env(name);
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
	if (result.error) {
		throw new Error(result.error.message);
	}
	if (!result.data) {
		throw new Error("Resend API returned empty data");
	}
	return result.data;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function isRateLimitError(error: unknown): boolean {
	const message =
		error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
	return message.includes("too many requests") || message.includes("429");
}

async function callResend<T>(
	label: string,
	fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
	let attempt = 0;
	while (attempt < 6) {
		attempt += 1;
		try {
			return unwrap(await fn());
		} catch (error) {
			if (!isRateLimitError(error) || attempt >= 6) {
				throw error;
			}
			const waitMs = 400 * attempt;
			console.warn(
				`Rate limited on ${label}; retrying in ${waitMs}ms (attempt ${attempt}/6)`,
			);
			await sleep(waitMs);
		}
	}
	throw new Error(`Unexpected retry exhaustion for ${label}`);
}

function renderEmailHtml(args: {
	kicker: string;
	title: string;
	intro: string;
	ctaLabel: string;
	ctaHref: string;
	steps: Array<{ title: string; body: string; hrefLabel?: string; href?: string }>;
	replyNote: string;
	includeUnsubscribe: boolean;
}): string {
	const stepsHtml = args.steps
		.map((step, index) => {
			const linkHtml =
				step.href && step.hrefLabel
					? `<p style="margin:8px 0 0;font-size:13px;line-height:1.5;"><a href="${step.href}" style="color:#1d4ed8;text-decoration:none;font-weight:700;">${step.hrefLabel}</a></p>`
					: "";
			return `
				<tr>
					<td style="padding:0 0 14px 0;">
						<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
							<tr>
								<td width="38" valign="top" style="padding:2px 10px 0 0;">
									<div style="width:28px;height:28px;border-radius:999px;background:#dbeafe;color:#1e3a8a;font-size:13px;line-height:28px;text-align:center;font-weight:700;">${index + 1}</div>
								</td>
								<td valign="top" style="padding:0;">
									<p style="margin:0;font-size:16px;line-height:1.35;color:#0f172a;font-weight:700;">${step.title}</p>
									<p style="margin:5px 0 0;font-size:14px;line-height:1.6;color:#334155;">${step.body}</p>
									${linkHtml}
								</td>
							</tr>
						</table>
					</td>
				</tr>
			`;
		})
		.join("");

	const unsubscribeHtml = args.includeUnsubscribe
		? `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#64748b;">Manage email preferences: <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#475569;">Unsubscribe</a></p>`
		: "";

	return `
<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width,initial-scale=1" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
	<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background:#0a1021;">
	<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${args.title}</div>
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a1021;background-image:radial-gradient(circle at 6% 15%, #1d4ed8 0, transparent 36%),radial-gradient(circle at 90% 6%, #22c55e 0, transparent 30%);">
		<tr>
			<td align="center" style="padding:26px 10px 34px;">
				<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;">
					<tr>
						<td style="padding:0;">
							<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:24px 24px 0 0;overflow:hidden;">
								<tr>
									<td style="padding:34px 34px 30px;background:linear-gradient(132deg,#1d4ed8 0%,#0f172a 54%,#0ea5e9 100%);font-family:'Montserrat','Avenir Next','Segoe UI',Arial,sans-serif;color:#f8fafc;">
										<p style="margin:0 0 10px;font-size:11px;line-height:1.2;letter-spacing:0.16em;text-transform:uppercase;opacity:0.95;font-weight:700;">${args.kicker}</p>
										<h1 style="margin:0 0 12px;font-size:31px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;">${args.title}</h1>
										<p style="margin:0;font-size:15px;line-height:1.65;color:#dbeafe;font-weight:500;">${args.intro}</p>
										<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
											<tr>
												<td style="border-radius:999px;background:#ffffff;">
													<a href="${args.ctaHref}" style="display:inline-block;padding:12px 18px;font-size:12px;line-height:1.2;text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;font-family:'Montserrat','Avenir Next','Segoe UI',Arial,sans-serif;color:#0f172a;font-weight:800;">${args.ctaLabel}</a>
												</td>
											</tr>
										</table>
									</td>
								</tr>
							</table>
							<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fbff;border:1px solid #cbd5e1;border-top:none;border-radius:0 0 24px 24px;">
								<tr>
									<td style="padding:26px 30px 10px;font-family:'Montserrat','Avenir Next','Segoe UI',Arial,sans-serif;">
										<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
											${stepsHtml}
										</table>
										<div style="margin:8px 0 0;padding:14px 16px;border-radius:12px;background:linear-gradient(90deg,#e0ecff 0%,#d9fbe8 100%);border:1px solid #bfdbfe;">
											<p style="margin:0;font-size:13px;line-height:1.6;color:#0f172a;font-weight:600;">${args.replyNote}</p>
										</div>
										${unsubscribeHtml}
									</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>
	`.trim();
}

function buildTemplates(args: {
	replyToEmail: string;
	dashboardUrl: string;
}): TemplateSpec[] {
	const dashboardUrl = args.dashboardUrl.replace(/\/+$/, "");
	const modelsUrl = `${dashboardUrl}/gateway`;
	const creditsUrl = `${dashboardUrl}/settings/credits`;
	const keysUrl = `${dashboardUrl}/settings/keys`;

	return [
		{
			alias: RESEND_ONBOARDING_TEMPLATE_ALIASES.WELCOME_INITIAL,
			name: "Onboarding - Welcome",
			subject: "Welcome to AI Stats",
			html: renderEmailHtml({
				kicker: "AI Stats onboarding",
				title: "Welcome. Your control layer is ready.",
				intro: "You now have one place to route requests, monitor usage, and move quickly across providers.",
				ctaLabel: "Open dashboard",
				ctaHref: dashboardUrl,
				steps: [
					{
						title: "Create your first API key",
						body: "Generate a key and keep your integration path simple from day one.",
						hrefLabel: "Manage keys",
						href: keysUrl,
					},
					{
						title: "Choose models for your first route",
						body: "Browse model IDs and pick a reliable baseline setup.",
						hrefLabel: "View model catalog",
						href: modelsUrl,
					},
					{
						title: "Top up credits when ready",
						body: "Enable uninterrupted testing and early production traffic.",
						hrefLabel: "Open credits",
						href: creditsUrl,
					},
				],
				replyNote: "Reply directly if you want help shipping your first request this week.",
				includeUnsubscribe: false,
			}),
			text: `Welcome to AI Stats.\n\n1) Add your first key: ${keysUrl}\n2) Explore models: ${modelsUrl}\n3) Top up credits: ${creditsUrl}\n\nReply if you want help with setup.`,
		},
		{
			alias: RESEND_ONBOARDING_TEMPLATE_ALIASES.WELCOME_PURCHASED_7D,
			name: "Onboarding - Purchased Within 7 Days",
			subject: "You're ready to ship with AI Stats",
			html: renderEmailHtml({
				kicker: "Momentum unlocked",
				title: "Credits are live. Let's get you moving.",
				intro: "Great call on purchasing credits early. Here is the fastest route to start seeing value immediately.",
				ctaLabel: "Start building",
				ctaHref: keysUrl,
				steps: [
					{
						title: "Plug your key into your app",
						body: "Use one key and keep your architecture clean while you test multiple providers.",
						hrefLabel: "Open keys",
						href: keysUrl,
					},
					{
						title: "Lock in your default model set",
						body: "Pick sensible defaults first, then tune for quality, speed, and spend.",
						hrefLabel: "Explore models",
						href: modelsUrl,
					},
					{
						title: "Track usage and cost in real time",
						body: "Watch calls, spend, and balance trends from one dashboard.",
						hrefLabel: "Open usage dashboard",
						href: dashboardUrl,
					},
				],
				replyNote: "Reply if you want a quick architecture review before scaling up traffic.",
				includeUnsubscribe: true,
			}),
			text: `Thanks for purchasing credits.\n\nNext: add an API key (${keysUrl}), review model IDs (${modelsUrl}), and monitor usage (${dashboardUrl}).\n\nReply for implementation help.\n\nUnsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}`,
		},
		{
			alias: RESEND_ONBOARDING_TEMPLATE_ALIASES.WELCOME_NOT_PURCHASED_7D,
			name: "Onboarding - No Purchase In 7 Days",
			subject: "Anything blocking you from getting started?",
			replyTo: args.replyToEmail,
			html: renderEmailHtml({
				kicker: "Quick pulse check",
				title: "Anything blocking your first credit purchase?",
				intro: "If you got stuck, reply and tell us what slowed you down. We will unblock you quickly.",
				ctaLabel: "Resume checkout",
				ctaHref: creditsUrl,
				steps: [
					{
						title: "Technical setup issue?",
						body: "We can help with key setup, API flow, or route configuration.",
					},
					{
						title: "Pricing not clear enough?",
						body: "Tell us your expected usage and we can suggest a practical starting plan.",
					},
					{
						title: "Unsure which model to pick?",
						body: "Share your use case and we can suggest a starting shortlist.",
						hrefLabel: "See available models",
						href: modelsUrl,
					},
				],
				replyNote: `Replies go straight to ${args.replyToEmail}. A short note is enough.`,
				includeUnsubscribe: true,
			}),
			text: `It looks like you haven't purchased credits yet.\n\nReply and tell us what blocked you (setup, pricing, model choice, or anything else) and we'll help.\n\nTop up any time: ${creditsUrl}\n\nUnsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}`,
		},
		{
			alias: RESEND_ONBOARDING_TEMPLATE_ALIASES.CHECKOUT_ABANDONED,
			name: "Onboarding - Checkout Started But Not Purchased",
			subject: "Did anything go wrong at checkout?",
			replyTo: args.replyToEmail,
			html: renderEmailHtml({
				kicker: "Checkout support",
				title: "Need help finishing your credit purchase?",
				intro: "Looks like checkout started but did not complete. If anything failed, we can help fast.",
				ctaLabel: "Return to checkout",
				ctaHref: creditsUrl,
				steps: [
					{
						title: "Payment friction",
						body: "Card or wallet issue? Reply with what happened and we will investigate immediately.",
					},
					{
						title: "Not ready to choose an amount",
						body: "We can recommend a low-risk amount to start with for your usage pattern.",
					},
					{
						title: "Need confidence before buying",
						body: "We can help validate your integration plan first.",
						hrefLabel: "Open credits settings",
						href: creditsUrl,
					},
				],
				replyNote: `Replies go straight to ${args.replyToEmail} so you can get direct help.`,
				includeUnsubscribe: true,
			}),
			text: `We noticed checkout started but purchase didn't complete.\n\nReply with what went wrong and we'll help.\n\nReturn to credits: ${creditsUrl}\n\nUnsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}`,
		},
	];
}

async function listAllTemplates(resend: Resend): Promise<
	Array<{
		id: string;
		alias: string | null;
		name: string;
	}>
> {
	const data = await callResend("templates.list", () =>
		resend.templates.list({ limit: 100 }),
	);
	return data.data.map((template) => ({
		id: template.id,
		alias: template.alias,
		name: template.name,
	}));
}

async function upsertTemplate(
	resend: Resend,
	existingTemplates: Array<{ id: string; alias: string | null; name: string }>,
	template: TemplateSpec,
	fromEmail: string,
): Promise<string> {
	const existing = existingTemplates.find((item) => item.alias === template.alias);
	const payload: CreateTemplateOptions = {
		name: template.name,
		alias: template.alias,
		subject: template.subject,
		from: fromEmail,
		replyTo: template.replyTo,
		html: template.html,
		text: template.text,
	};

	let templateId: string;
	if (!existing) {
		const created = await callResend<{ id: string }>(
			`templates.create:${template.alias}`,
			() => resend.templates.create(payload),
		);
		templateId = created.id;
		console.log(`Created template: ${template.alias}`);
	} else {
		await callResend(`templates.update:${template.alias}`, () =>
			resend.templates.update(existing.id, payload),
		);
		templateId = existing.id;
		console.log(`Updated template: ${template.alias}`);
	}

	await callResend(`templates.publish:${template.alias}`, () =>
		resend.templates.publish(templateId),
	);
	console.log(`Published template: ${template.alias}`);
	return templateId;
}

async function listAllContactProperties(resend: Resend): Promise<
	Array<{ id: string; key: string; type: "string" | "number" }>
> {
	const data = await callResend("contactProperties.list", () =>
		resend.contactProperties.list({ limit: 100 }),
	);
	return data.data.map((item) => ({
		id: item.id,
		key: item.key,
		type: item.type,
	}));
}

async function ensureContactProperties(resend: Resend): Promise<void> {
	const existing = await listAllContactProperties(resend);
	const required = [
		{ key: "has_bought_credits", type: "string" as const, fallbackValue: "false" },
		{ key: "last_credit_purchase_nanos", type: "number" as const, fallbackValue: 0 },
		{ key: "last_credit_purchase_at", type: "string" as const, fallbackValue: "" },
		{
			key: "last_credit_checkout_session_id",
			type: "string" as const,
			fallbackValue: "",
		},
	];

	for (const property of required) {
		const current = existing.find((item) => item.key === property.key);
		if (!current) {
			await callResend(`contactProperties.create:${property.key}`, () =>
				resend.contactProperties.create(property),
			);
			console.log(`Created contact property: ${property.key}`);
			continue;
		}
		if (current.type !== property.type) {
			throw new Error(
				`Contact property type mismatch for "${property.key}". Expected ${property.type}, found ${current.type}.`,
			);
		}
	}
}

async function listAllEvents(resend: Resend): Promise<Array<{ id: string; name: string }>> {
	const data = await callResend("events.list", () => resend.events.list({ limit: 100 }));
	return data.data.map((event) => ({
		id: event.id,
		name: event.name,
	}));
}

async function ensureEvents(resend: Resend): Promise<void> {
	const current = await listAllEvents(resend);
	const required = Object.values(RESEND_ONBOARDING_EVENT_NAMES);

	for (const eventName of required) {
		if (current.some((event) => event.name === eventName)) continue;
		await callResend(`events.create:${eventName}`, () =>
			resend.events.create({ name: eventName }),
		);
		console.log(`Created event: ${eventName}`);
	}
}

async function listAllAutomations(resend: Resend): Promise<Array<{ id: string; name: string }>> {
	const data = await callResend("automations.list", () =>
		resend.automations.list({ limit: 100 }),
	);
	return data.data.map((automation) => ({
		id: automation.id,
		name: automation.name,
	}));
}

function buildAutomations(args: {
	templateIds: Record<string, string>;
	replyToEmail: string;
	purchaseWindow: string;
	checkoutTimeout: string;
	customersSegmentId?: string;
}): AutomationDefinition[] {
	const welcome7Day: AutomationDefinition = {
		name: RESEND_ONBOARDING_AUTOMATION_NAMES.WELCOME_7_DAY_BRANCH,
		steps: [
			{
				key: "trigger_user_created",
				type: "trigger",
				config: { eventName: RESEND_ONBOARDING_EVENT_NAMES.USER_CREATED },
			},
			{
				key: "send_welcome_initial",
				type: "send_email",
				config: {
					template: { id: args.templateIds[RESEND_ONBOARDING_TEMPLATE_ALIASES.WELCOME_INITIAL] },
				},
			},
			{
				key: "wait_for_purchase_7d",
				type: "wait_for_event",
				config: {
					eventName: RESEND_ONBOARDING_EVENT_NAMES.CREDITS_PURCHASED,
					timeout: args.purchaseWindow,
				},
			},
			{
				key: "send_purchased_branch",
				type: "send_email",
				config: {
					template: {
						id: args.templateIds[RESEND_ONBOARDING_TEMPLATE_ALIASES.WELCOME_PURCHASED_7D],
					},
				},
			},
			{
				key: "send_not_purchased_branch",
				type: "send_email",
				config: {
					template: {
						id: args.templateIds[RESEND_ONBOARDING_TEMPLATE_ALIASES.WELCOME_NOT_PURCHASED_7D],
					},
					replyTo: args.replyToEmail,
				},
			},
		],
		connections: [
			{ from: "trigger_user_created", to: "send_welcome_initial" },
			{ from: "send_welcome_initial", to: "wait_for_purchase_7d" },
			{
				from: "wait_for_purchase_7d",
				to: "send_purchased_branch",
				type: "event_received",
			},
			{
				from: "wait_for_purchase_7d",
				to: "send_not_purchased_branch",
				type: "timeout",
			},
		],
	};

	const checkoutAbandoned: AutomationDefinition = {
		name: RESEND_ONBOARDING_AUTOMATION_NAMES.CHECKOUT_ABANDONMENT,
		steps: [
			{
				key: "trigger_checkout_started",
				type: "trigger",
				config: { eventName: RESEND_ONBOARDING_EVENT_NAMES.CHECKOUT_STARTED },
			},
			{
				key: "wait_for_purchase",
				type: "wait_for_event",
				config: {
					eventName: RESEND_ONBOARDING_EVENT_NAMES.CREDITS_PURCHASED,
					timeout: args.checkoutTimeout,
				},
			},
			{
				key: "send_checkout_timeout",
				type: "send_email",
				config: {
					template: {
						id: args.templateIds[RESEND_ONBOARDING_TEMPLATE_ALIASES.CHECKOUT_ABANDONED],
					},
					replyTo: args.replyToEmail,
				},
			},
		],
		connections: [
			{ from: "trigger_checkout_started", to: "wait_for_purchase" },
			{
				from: "wait_for_purchase",
				to: "send_checkout_timeout",
				type: "timeout",
			},
		],
	};

	const purchaseStateSteps: AutomationStep[] = [
		{
			key: "trigger_credits_purchased",
			type: "trigger",
			config: { eventName: RESEND_ONBOARDING_EVENT_NAMES.CREDITS_PURCHASED },
		},
		{
			key: "contact_update_purchase_state",
			type: "contact_update",
			config: {
				properties: {
					has_bought_credits: "true",
					last_credit_purchase_nanos: { var: "event.amountNanos" },
					last_credit_purchase_at: { var: "event.creditedAtIso" },
					last_credit_checkout_session_id: { var: "event.checkoutSessionId" },
				},
			},
		},
	];
	const purchaseStateConnections: AutomationConnection[] = [
		{ from: "trigger_credits_purchased", to: "contact_update_purchase_state" },
	];

	if (args.customersSegmentId) {
		purchaseStateSteps.push({
			key: "add_to_customers_segment",
			type: "add_to_segment",
			config: { segmentId: args.customersSegmentId },
		});
		purchaseStateConnections.push({
			from: "contact_update_purchase_state",
			to: "add_to_customers_segment",
		});
	}

	const purchaseState: AutomationDefinition = {
		name: RESEND_ONBOARDING_AUTOMATION_NAMES.PURCHASED_CONTACT_STATE,
		steps: purchaseStateSteps,
		connections: purchaseStateConnections,
	};

	return [welcome7Day, checkoutAbandoned, purchaseState];
}

async function upsertAutomation(
	resend: Resend,
	existing: Array<{ id: string; name: string }>,
	definition: AutomationDefinition,
	status: "enabled" | "disabled",
): Promise<void> {
	const current = existing.find((automation) => automation.name === definition.name);
	if (!current) {
		await callResend(`automations.create:${definition.name}`, () =>
			resend.automations.create({
				name: definition.name,
				status,
				steps: definition.steps,
				connections: definition.connections,
			}),
		);
		console.log(`Created automation: ${definition.name}`);
		return;
	}

	await callResend(`automations.update:${definition.name}`, () =>
		resend.automations.update(current.id, {
			name: definition.name,
			status,
			steps: definition.steps,
			connections: definition.connections,
		}),
	);
	console.log(`Updated automation: ${definition.name}`);
}

async function main(): Promise<void> {
	const apiKey = requiredEnv("RESEND_API_KEY");
	const fromEmail = env("RESEND_FROM_EMAIL", "AI Stats <noreply@phaseo.app>");
	const replyToEmail = env("RESEND_ONBOARDING_REPLY_TO_EMAIL", "support@aistats.com");
	const dashboardUrl = env(
		"RESEND_ONBOARDING_DASHBOARD_URL",
		env("NEXT_PUBLIC_WEBSITE_URL", "https://www.aistats.com"),
	);
	const purchaseWindow = env("RESEND_ONBOARDING_PURCHASE_WINDOW", "7 days");
	const checkoutTimeout = env("RESEND_CHECKOUT_ABANDONED_TIMEOUT", "24 hours");
	const segmentId = env("RESEND_CUSTOMERS_SEGMENT_ID");
	const automationStatusRaw = env("RESEND_ONBOARDING_AUTOMATION_STATUS", "enabled");
	const automationStatus = automationStatusRaw === "disabled" ? "disabled" : "enabled";

	const resend = new Resend(apiKey);

	console.log("Ensuring custom events...");
	await ensureEvents(resend);

	console.log("Ensuring contact properties...");
	await ensureContactProperties(resend);

	console.log("Upserting templates...");
	const existingTemplates = await listAllTemplates(resend);
	const templateSpecs = buildTemplates({
		replyToEmail,
		dashboardUrl,
	});
	const templateIds: Record<string, string> = {};
	for (const template of templateSpecs) {
		templateIds[template.alias] = await upsertTemplate(
			resend,
			existingTemplates,
			template,
			fromEmail,
		);
	}

	console.log("Upserting automations...");
	const existingAutomations = await listAllAutomations(resend);
	const automations = buildAutomations({
		templateIds,
		replyToEmail,
		purchaseWindow,
		checkoutTimeout,
		customersSegmentId: segmentId || undefined,
	});
	for (const automation of automations) {
		await upsertAutomation(resend, existingAutomations, automation, automationStatus);
	}

	console.log("Provisioning complete.");
}

main().catch((error) => {
	console.error("Failed to provision onboarding automations:", error);
	process.exitCode = 1;
});
