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

function markdownEmailWrapper(contentHtml: string): string {
	return [
		"<div style=\"background:#f6f8fc;padding:32px 12px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;\">",
		"<div style=\"max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;\">",
		contentHtml,
		"</div>",
		"</div>",
	].join("");
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
			html: markdownEmailWrapper(
				[
					"<h1 style=\"margin:0 0 14px;font-size:24px;line-height:1.2;\">Welcome to AI Stats</h1>",
					"<p style=\"margin:0 0 14px;font-size:15px;line-height:1.6;\">You're in. Start routing traffic and monitoring usage in minutes.</p>",
					"<ol style=\"margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6;\">",
					`<li>Add your first API key: <a href="${keysUrl}">${keysUrl}</a></li>`,
					`<li>Review supported models: <a href="${modelsUrl}">${modelsUrl}</a></li>`,
					`<li>Top up credits any time: <a href="${creditsUrl}">${creditsUrl}</a></li>`,
					"</ol>",
					"<p style=\"margin:0;font-size:14px;line-height:1.6;color:#334155;\">Reply if you want help getting your first request live.</p>",
				].join(""),
			),
			text: `Welcome to AI Stats.\n\n1) Add your first key: ${keysUrl}\n2) Explore models: ${modelsUrl}\n3) Top up credits: ${creditsUrl}\n\nReply if you want help with setup.`,
		},
		{
			alias: RESEND_ONBOARDING_TEMPLATE_ALIASES.WELCOME_PURCHASED_7D,
			name: "Onboarding - Purchased Within 7 Days",
			subject: "You're ready to ship with AI Stats",
			html: markdownEmailWrapper(
				[
					"<h1 style=\"margin:0 0 14px;font-size:24px;line-height:1.2;\">You're all set</h1>",
					"<p style=\"margin:0 0 14px;font-size:15px;line-height:1.6;\">Thanks for purchasing credits. Here are the fastest next steps:</p>",
					"<ul style=\"margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6;\">",
					`<li>Use one key to access multiple providers: <a href="${keysUrl}">${keysUrl}</a></li>`,
					`<li>Find model IDs and pricing: <a href="${modelsUrl}">${modelsUrl}</a></li>`,
					`<li>Track spend and usage in real time: <a href="${dashboardUrl}">${dashboardUrl}</a></li>`,
					"</ul>",
					"<p style=\"margin:0;font-size:14px;line-height:1.6;color:#334155;\">If you want implementation help, just reply and I'll assist directly.</p>",
					"<p style=\"margin:16px 0 0;font-size:12px;line-height:1.6;color:#64748b;\">Manage email preferences: <a href=\"{{{RESEND_UNSUBSCRIBE_URL}}}\">Unsubscribe</a></p>",
				].join(""),
			),
			text: `Thanks for purchasing credits.\n\nNext: add an API key (${keysUrl}), review model IDs (${modelsUrl}), and monitor usage (${dashboardUrl}).\n\nReply for implementation help.\n\nUnsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}`,
		},
		{
			alias: RESEND_ONBOARDING_TEMPLATE_ALIASES.WELCOME_NOT_PURCHASED_7D,
			name: "Onboarding - No Purchase In 7 Days",
			subject: "Anything blocking you from getting started?",
			replyTo: args.replyToEmail,
			html: markdownEmailWrapper(
				[
					"<h1 style=\"margin:0 0 14px;font-size:24px;line-height:1.2;\">Quick check-in</h1>",
					"<p style=\"margin:0 0 14px;font-size:15px;line-height:1.6;\">It looks like you haven't purchased credits yet. If something blocked you, reply and tell us what happened.</p>",
					"<p style=\"margin:0 0 14px;font-size:15px;line-height:1.6;\">Common blockers we can help with: setup, pricing clarity, or model selection.</p>",
					`<p style=\"margin:0;font-size:14px;line-height:1.6;color:#334155;\">You can also top up here any time: <a href="${creditsUrl}">${creditsUrl}</a></p>`,
					"<p style=\"margin:16px 0 0;font-size:12px;line-height:1.6;color:#64748b;\">Manage email preferences: <a href=\"{{{RESEND_UNSUBSCRIBE_URL}}}\">Unsubscribe</a></p>",
				].join(""),
			),
			text: `It looks like you haven't purchased credits yet.\n\nReply and tell us what blocked you (setup, pricing, model choice, or anything else) and we'll help.\n\nTop up any time: ${creditsUrl}\n\nUnsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}`,
		},
		{
			alias: RESEND_ONBOARDING_TEMPLATE_ALIASES.CHECKOUT_ABANDONED,
			name: "Onboarding - Checkout Started But Not Purchased",
			subject: "Did anything go wrong at checkout?",
			replyTo: args.replyToEmail,
			html: markdownEmailWrapper(
				[
					"<h1 style=\"margin:0 0 14px;font-size:24px;line-height:1.2;\">Need help finishing checkout?</h1>",
					"<p style=\"margin:0 0 14px;font-size:15px;line-height:1.6;\">We noticed checkout started but purchase didn't complete.</p>",
					"<p style=\"margin:0 0 14px;font-size:15px;line-height:1.6;\">Reply with what stopped you and we'll fix it fast.</p>",
					`<p style=\"margin:0;font-size:14px;line-height:1.6;color:#334155;\">Return to credits: <a href="${creditsUrl}">${creditsUrl}</a></p>`,
					"<p style=\"margin:16px 0 0;font-size:12px;line-height:1.6;color:#64748b;\">Manage email preferences: <a href=\"{{{RESEND_UNSUBSCRIBE_URL}}}\">Unsubscribe</a></p>",
				].join(""),
			),
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
