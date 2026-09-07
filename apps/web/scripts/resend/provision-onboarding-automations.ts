#!/usr/bin/env tsx

import {
	Resend,
	type AutomationConnection,
	type AutomationStep,
	type CreateTemplateOptions,
} from "resend";
import {
	RESEND_ONBOARDING_AUTOMATION_LEGACY_NAMES,
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
	variables?: Array<
		| {
				key: string;
				type: "string";
				fallbackValue: string;
		  }
		| {
				key: string;
				type: "number";
				fallbackValue: number;
		  }
	>;
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
	title: string;
	intro: string;
	ctaLabel: string;
	ctaHref: string;
	steps: Array<{ title: string; body: string; hrefLabel?: string; href?: string }>;
	replyToEmail: string;
	includeUnsubscribe: boolean;
}): string {
	const stepsHtml = args.steps
		.map((step, index) => {
			const linkHtml =
				step.href && step.hrefLabel
					? `<p style="margin-top:8px;margin-right:0;margin-bottom:0;margin-left:0;font-size:13px;line-height:20px;color:#3f3f46;font-weight:400;"><a href="${step.href}" style="font-size:13px;line-height:20px;color:#0369a1;text-decoration:underline;font-weight:600;">${step.hrefLabel}</a></p>`
					: "";
			return `
				<tr>
					<td style="padding-top:${index === 0 ? "0" : "12px"};padding-right:0;padding-bottom:12px;padding-left:0;border-bottom:1px solid #e4e4e7;">
						<p style="margin-top:0;margin-right:0;margin-bottom:5px;margin-left:0;font-size:15px;line-height:21px;color:#18181b;font-weight:700;">0${index + 1} &nbsp; ${step.title}</p>
						<p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-size:14px;line-height:22px;color:#52525b;font-weight:400;">${step.body}</p>
						${linkHtml}
					</td>
				</tr>
			`;
		})
		.join("");

	const unsubscribeHtml = args.includeUnsubscribe
		? `<p style="margin-top:16px;margin-right:0;margin-bottom:0;margin-left:0;font-size:12px;line-height:18px;color:#71717a;font-weight:400;">Manage email preferences: <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="font-size:12px;line-height:18px;color:#52525b;text-decoration:underline;font-weight:400;">Unsubscribe</a></p>`
		: "";

	return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#18181b;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%;">
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;background-color:#ffffff;">
		<tr>
			<td align="center" style="padding-top:40px;padding-right:20px;padding-bottom:40px;padding-left:20px;">
				<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;min-width:0;background-color:#ffffff;">
				<tr><td style="padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;font-family:Arial,Helvetica,sans-serif;color:#18181b;font-size:16px;line-height:26px;">
						<table role="presentation" align="center" width="147" cellpadding="0" cellspacing="0" border="0" bgcolor="#0284c7" style="width:147px;margin-bottom:28px;background-color:#0284c7;border-radius:8px;"><tr>
							<td style="padding-top:14px;padding-right:16px;padding-bottom:14px;padding-left:16px;vertical-align:middle;"><img src="https://phaseo.app/wordmark_dark.svg" width="115" height="24" border="0" alt="Phaseo" style="display:block;width:115px;height:24px;border:0;"></td>
						</tr></table>
						<h1 align="center" style="margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;font-size:28px;line-height:34px;letter-spacing:-.02em;color:#09090b;font-weight:500;">${args.title}</h1>
						<p align="center" style="margin-top:0;margin-right:0;margin-bottom:10px;margin-left:0;font-size:15px;line-height:26px;color:#18181b;font-weight:600;">Hi {{{user_name}}},</p>
						<p align="center" style="margin-top:0;margin-right:0;margin-bottom:26px;margin-left:0;font-size:16px;line-height:26px;color:#3f3f46;font-weight:400;">${args.intro}</p>
						<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:26px;"><tr>
							<td style="border-radius:6px;background-color:#0369a1;" bgcolor="#0369a1"><a href="${args.ctaHref}" style="display:inline-block;padding-top:11px;padding-right:15px;padding-bottom:11px;padding-left:15px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;text-decoration:none;color:#ffffff;font-weight:600;">${args.ctaLabel}</a></td>
						</tr></table>
						<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;"><tr><td style="height:1px;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;background-color:#e4e4e7;font-size:1px;line-height:1px;" bgcolor="#e4e4e7">&nbsp;</td></tr></table>
						<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stepsHtml}</table>
						<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr><td style="padding-top:18px;padding-right:0;padding-bottom:0;padding-left:0;border-top:1px solid #e4e4e7;">
							<p style="margin-top:0;margin-right:0;margin-bottom:4px;margin-left:0;font-size:12px;line-height:18px;color:#71717a;font-weight:600;">Need help?</p>
							<p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-size:13px;line-height:21px;color:#52525b;font-weight:400;">Reply to this email and we&rsquo;ll get back to you at <a href="mailto:${args.replyToEmail}" style="font-size:13px;line-height:21px;color:#3f3f46;text-decoration:underline;font-weight:600;">${args.replyToEmail}</a>.</p>
						</td></tr></table>
						${unsubscribeHtml}
					</td></tr>
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
			subject: "Welcome to Phaseo",
			replyTo: args.replyToEmail,
			html: renderEmailHtml({
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
				replyToEmail: args.replyToEmail,
				includeUnsubscribe: false,
			}),
			text: `Hi {{{user_name}}},\n\nWelcome to Phaseo.\n\n1) Add your first key: ${keysUrl}\n2) Explore models: ${modelsUrl}\n3) Top up credits: ${creditsUrl}\n\nNeed help? Reply to this email and we'll get back to you at ${args.replyToEmail}.`,
		},
		{
			alias: RESEND_ONBOARDING_TEMPLATE_ALIASES.WELCOME_PURCHASED_7D,
			name: "Onboarding - Purchased Within 3 Days",
			subject: "You're ready to ship with Phaseo",
			replyTo: args.replyToEmail,
			html: renderEmailHtml({
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
				replyToEmail: args.replyToEmail,
				includeUnsubscribe: true,
			}),
			text: `Hi {{{user_name}}},\n\nThanks for purchasing credits.\n\nNext: add an API key (${keysUrl}), review model IDs (${modelsUrl}), and monitor usage (${dashboardUrl}).\n\nNeed help? Reply to this email and we'll get back to you at ${args.replyToEmail}.\n\nManage email preferences: {{{RESEND_UNSUBSCRIBE_URL}}}`,
		},
		{
			alias: RESEND_ONBOARDING_TEMPLATE_ALIASES.WELCOME_NOT_PURCHASED_7D,
			name: "Onboarding - No Purchase In 3 Days",
			subject: "Anything blocking you from getting started?",
			replyTo: args.replyToEmail,
			html: renderEmailHtml({
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
				replyToEmail: args.replyToEmail,
				includeUnsubscribe: true,
			}),
			text: `Hi {{{user_name}}},\n\nIt looks like you haven't purchased credits yet.\n\nNeed help? Reply to this email and we'll get back to you at ${args.replyToEmail}.\n\nTop up any time: ${creditsUrl}\n\nManage email preferences: {{{RESEND_UNSUBSCRIBE_URL}}}`,
		},
		{
			alias: RESEND_ONBOARDING_TEMPLATE_ALIASES.CHECKOUT_ABANDONED,
			name: "Onboarding - Checkout Started But Not Purchased",
			subject: "Did anything go wrong at checkout?",
			replyTo: args.replyToEmail,
			html: renderEmailHtml({
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
				replyToEmail: args.replyToEmail,
				includeUnsubscribe: true,
			}),
			text: `Hi {{{user_name}}},\n\nWe noticed checkout started but purchase didn't complete.\n\nNeed help? Reply to this email and we'll get back to you at ${args.replyToEmail}.\n\nReturn to credits: ${creditsUrl}\n\nManage email preferences: {{{RESEND_UNSUBSCRIBE_URL}}}`,
		},
		{
			alias: RESEND_ONBOARDING_TEMPLATE_ALIASES.LOW_BALANCE,
			name: "Billing - Low Balance Alert",
			subject: "Low credit balance alert",
			replyTo: args.replyToEmail,
			html: renderEmailHtml({
				title: "Your balance is running low.",
				intro: "Your {{{workspace_name}}} balance is now at ${{{balance_remaining}}}, below your configured threshold of ${{{low_balance_threshold}}}.",
				ctaLabel: "Top up credits",
				ctaHref: creditsUrl,
				steps: [
					{
						title: "Top up now to avoid interruptions",
						body: "Add credits to keep traffic and testing uninterrupted.",
						hrefLabel: "Open credits settings",
						href: creditsUrl,
					},
					{
						title: "Adjust your threshold if needed",
						body: "You can change your low-balance alert amount any time in Settings.",
						hrefLabel: "Review threshold settings",
						href: creditsUrl,
					},
					{
						title: "Need help?",
						body: `Reply and we can help set a practical threshold based on your usage.`,
					},
				],
				replyToEmail: args.replyToEmail,
				includeUnsubscribe: false,
			}),
			text: `Hi {{{user_name}}},\n\nYour {{{workspace_name}}} balance is now \${{{balance_remaining}}}, below your alert threshold of \${{{low_balance_threshold}}}.\n\nTop up credits here: ${creditsUrl}\n\nNeed help? Reply to this email and we'll get back to you at ${args.replyToEmail}.`,
			variables: [
				{ key: "user_name", type: "string", fallbackValue: "there" },
				{ key: "workspace_name", type: "string", fallbackValue: "your workspace" },
				{ key: "balance_remaining", type: "number", fallbackValue: 0 },
				{ key: "low_balance_threshold", type: "number", fallbackValue: 0 },
			],
		},
		{
			alias: RESEND_ONBOARDING_TEMPLATE_ALIASES.MODEL_DEPRECATION,
			name: "Model - Deprecation Alert",
			subject: "Model deprecation: {{{model_name}}}",
			replyTo: args.replyToEmail,
			html: `
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<meta http-equiv="X-UA-Compatible" content="IE=edge">
	</head>
<body style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#18181b;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%;">
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;background-color:#ffffff;">
		<tr><td align="center" style="padding-top:40px;padding-right:20px;padding-bottom:40px;padding-left:20px;">
			<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;min-width:0;background-color:#ffffff;">
				<tr><td style="padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;font-family:Arial,Helvetica,sans-serif;color:#18181b;font-size:16px;line-height:26px;">
					<table role="presentation" align="center" width="147" cellpadding="0" cellspacing="0" border="0" bgcolor="#0284c7" style="width:147px;margin-bottom:28px;background-color:#0284c7;border-radius:8px;"><tr>
						<td style="padding-top:14px;padding-right:16px;padding-bottom:14px;padding-left:16px;vertical-align:middle;"><img src="https://phaseo.app/wordmark_dark.svg" width="115" height="24" border="0" alt="Phaseo" style="display:block;width:115px;height:24px;border:0;"></td>
					</tr></table>
					<h1 align="center" style="margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;font-size:28px;line-height:34px;letter-spacing:-.02em;color:#09090b;font-weight:500;">{{{model_name}}} is changing</h1>
					<p align="center" style="margin-top:0;margin-right:0;margin-bottom:10px;margin-left:0;font-size:15px;line-height:26px;color:#18181b;font-weight:600;">Hi {{{user_name}}},</p>
					<p style="margin-top:0;margin-right:0;margin-bottom:26px;margin-left:0;font-size:16px;line-height:26px;color:#3f3f46;font-weight:400;">{{{message}}}</p>
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f7f8" style="margin-bottom:22px;background-color:#f6f7f8;border:1px solid #e4e4e7;border-radius:10px;"><tr><td style="padding-top:14px;padding-right:16px;padding-bottom:14px;padding-left:16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#3f3f46;font-weight:600;">Recommended successor: {{{replacement_model_name}}}</td></tr></table>
					<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
						<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:6px;background-color:#0369a1;" bgcolor="#0369a1"><a href="{{{compare_url}}}" style="display:inline-block;padding-top:11px;padding-right:15px;padding-bottom:11px;padding-left:15px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;text-decoration:none;color:#ffffff;font-weight:600;white-space:nowrap;">Compare models</a></td></tr></table>
						<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td height="8" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr></table>
						<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td style="border:1px solid #bae6fd;border-radius:6px;background-color:#ffffff;" bgcolor="#ffffff"><a href="{{{replacement_model_url}}}" style="display:inline-block;padding-top:10px;padding-right:14px;padding-bottom:10px;padding-left:14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;text-decoration:none;color:#0369a1;font-weight:600;white-space:nowrap;">View recommended model</a></td></tr></table>
					</td></tr></table>
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr><td style="padding-top:18px;padding-right:0;padding-bottom:0;padding-left:0;border-top:1px solid #e4e4e7;">
						<p style="margin-top:0;margin-right:0;margin-bottom:4px;margin-left:0;font-size:12px;line-height:18px;color:#71717a;font-weight:600;">Need help?</p>
						<p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-size:13px;line-height:21px;color:#52525b;font-weight:400;">Reply to this email and we&rsquo;ll get back to you at <a href="mailto:${args.replyToEmail}" style="font-size:13px;line-height:21px;color:#3f3f46;text-decoration:underline;font-weight:600;">${args.replyToEmail}</a>.</p>
					</td></tr></table>
					<p align="center" style="margin-top:26px;margin-right:0;margin-bottom:0;margin-left:0;font-size:13px;line-height:20px;color:#71717a;font-weight:400;"><a href="{{{settings_url}}}" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#52525b;text-decoration:underline;font-weight:400;">Manage notifications</a></p>
				</td></tr>
			</table>
		</td></tr>
	</table>
</body>
</html>`.trim(),
			text: `Hi {{{user_name}}},\n\n{{{message}}}\n\nRecommended successor: {{{replacement_model_name}}}\n\nCompare models: {{{compare_url}}}\nView recommended model: {{{replacement_model_url}}}\nManage notifications: {{{settings_url}}}`,
			variables: [
				{ key: "user_name", type: "string", fallbackValue: "there" },
				{ key: "model_name", type: "string", fallbackValue: "A model used by your workspace" },
				{ key: "message", type: "string", fallbackValue: "A model used by your workspace is changing." },
				{ key: "replacement_model_name", type: "string", fallbackValue: "a supported replacement" },
				{ key: "compare_url", type: "string", fallbackValue: "https://phaseo.app/models" },
				{ key: "replacement_model_url", type: "string", fallbackValue: "https://phaseo.app/models" },
				{ key: "settings_url", type: "string", fallbackValue: "https://phaseo.app/settings/notifications" },
			],
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
		variables: template.variables ?? [
			{
				key: "user_name",
				type: "string",
				fallbackValue: "there",
			},
		],
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
				key: "set_contact_name_from_signup",
				type: "contact_update",
				config: {
					firstName: { var: "event.firstName" },
				},
			},
			{
				key: "send_welcome_initial",
				type: "send_email",
				config: {
					template: {
						id: args.templateIds[RESEND_ONBOARDING_TEMPLATE_ALIASES.WELCOME_INITIAL],
						variables: {
							user_name: { var: "contact.first_name" },
						},
					},
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
						variables: {
							user_name: { var: "contact.first_name" },
						},
					},
				},
			},
			{
				key: "send_not_purchased_branch",
				type: "send_email",
				config: {
					template: {
						id: args.templateIds[RESEND_ONBOARDING_TEMPLATE_ALIASES.WELCOME_NOT_PURCHASED_7D],
						variables: {
							user_name: { var: "contact.first_name" },
						},
					},
					replyTo: args.replyToEmail,
				},
			},
		],
		connections: [
			{ from: "trigger_user_created", to: "set_contact_name_from_signup" },
			{ from: "set_contact_name_from_signup", to: "send_welcome_initial" },
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
						variables: {
							user_name: { var: "event.firstName" },
						},
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
				firstName: { var: "event.firstName" },
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

	const lowBalanceAlert: AutomationDefinition = {
		name: RESEND_ONBOARDING_AUTOMATION_NAMES.LOW_BALANCE_ALERT,
		steps: [
			{
				key: "trigger_low_balance",
				type: "trigger",
				config: { eventName: RESEND_ONBOARDING_EVENT_NAMES.WORKSPACE_LOW_BALANCE },
			},
			{
				key: "send_low_balance_email",
				type: "send_email",
				config: {
					template: {
						id: args.templateIds[RESEND_ONBOARDING_TEMPLATE_ALIASES.LOW_BALANCE],
						variables: {
							user_name: { var: "event.firstName" },
							workspace_name: { var: "event.workspaceName" },
							balance_remaining: { var: "event.balanceUsd" },
							low_balance_threshold: { var: "event.thresholdUsd" },
						},
					},
					replyTo: args.replyToEmail,
				},
			},
		],
		connections: [{ from: "trigger_low_balance", to: "send_low_balance_email" }],
	};

	return [welcome7Day, checkoutAbandoned, purchaseState, lowBalanceAlert];
}

async function upsertAutomation(
	resend: Resend,
	existing: Array<{ id: string; name: string }>,
	definition: AutomationDefinition,
	status: "enabled" | "disabled",
): Promise<void> {
	const legacyNames: string[] =
		definition.name === RESEND_ONBOARDING_AUTOMATION_NAMES.WELCOME_7_DAY_BRANCH
			? [...RESEND_ONBOARDING_AUTOMATION_LEGACY_NAMES.WELCOME_7_DAY_BRANCH]
			: [];
	const current = existing.find(
		(automation) =>
			automation.name === definition.name || legacyNames.includes(automation.name),
	);
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
	const fromEmail = env("RESEND_FROM_EMAIL", "Phaseo <noreply@phaseo.app>");
	const replyToEmail = env("RESEND_ONBOARDING_REPLY_TO_EMAIL", "daniel@phaseo.app");
	const dashboardUrl = env(
		"RESEND_ONBOARDING_DASHBOARD_URL",
		env("NEXT_PUBLIC_WEBSITE_URL", "https://phaseo.app"),
	);
	const purchaseWindow = env("RESEND_ONBOARDING_PURCHASE_WINDOW", "3 days");
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
	console.log(`Model deprecation template ID: ${templateIds[RESEND_ONBOARDING_TEMPLATE_ALIASES.MODEL_DEPRECATION]}`);

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
