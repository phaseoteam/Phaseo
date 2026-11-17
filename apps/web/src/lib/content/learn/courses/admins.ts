import type { LearnCourse } from "../types";

const DOCS = "https://phaseo.app/docs/v1";

export const adminsCourse: LearnCourse = {
	slug: "set-up-your-team",
	title: "Set up Phaseo for your team",
	summary:
		"Bring your team into a workspace, hand out keys safely, cap spend, set guardrails and routing, and see how AI is being used. No code needed.",
	level: "admin",
	format: "No code",
	prerequisites: ["What is Phaseo?"],
	lessons: [
		{
			slug: "workspaces-and-members",
			title: "Workspaces and members",
			summary:
				"Use workspaces to keep teams apart, invite people with a code, and give each person the right role.",
			minutes: 7,
			body: `A workspace holds its own API keys, routing settings, presets, guardrails and admin access. Every account starts with a personal workspace. Create more for each team, product or environment, for example to keep production keys away from development. Extra workspaces unlock after your first credit deposit, and they don't change your pricing.

Each person in a workspace has one of three roles:

- **Owner**: the person who owns the workspace. Only the owner can make someone an admin, change roles or remove other members. The owner can't be removed.
- **Admin**: manages the admin-only settings, such as API keys, budgets, spend rules and guardrails, and reads the audit log.
- **Member**: uses the workspace and can see its spend rules, but can't change owner- and admin-only settings.

To invite someone, open **Settings → Members** and select **Create Invite**. Choose the role (Admin or Member), how many days the invite lasts and, if you like, a maximum number of uses. You get a code to share. Your teammate opens **Settings → Workspaces**, chooses **Got an invite code?** and enters it. That sends a join request, which an owner or admin approves under **Join requests**. Only the owner can approve someone as an admin.

Switch between workspaces with the workspace switcher in the header. Everything you see in Settings, from keys to usage, belongs to the workspace you have open. Your personal workspace can't be renamed or deleted.`,
			quiz: {
				question: "An admin wants to bring a new colleague in as another admin. What happens?",
				options: [
					"The admin creates an invite with the Admin role and approves the join request.",
					"Only the workspace owner can invite or approve someone as an admin.",
					"Admins can't be invited; every new person joins as an owner.",
				],
				answer: 1,
				explanation:
					"Making someone an admin is the owner's call. An admin can invite members, but an Admin-role invite, its approval and later role changes all need the workspace owner.",
			},
			scenario: {
				prompt:
					"A contractor has finished their project and you want them out of the workspace. They set up the API key your support bot still uses. What should you check first?",
				answer:
					"Removing a member also revokes the API keys they created in that workspace, so the support bot would stop working. First create a replacement key yourself (or rotate theirs into a new key), move the bot to it, then ask the owner to remove the contractor under Settings → Members.",
			},
			takeaway:
				"Give each team or environment its own workspace, and keep the Admin role for the few people who manage keys, budgets and guardrails.",
			links: [
				{ label: "Workspaces guide", href: `${DOCS}/guides/workspaces` },
				{ label: "Members", href: "/settings/workspaces/members" },
				{ label: "Your workspaces", href: "/settings/account/workspaces" },
				{ label: "Glossary: roles", href: `${DOCS}/glossary` },
			],
			updated: "2026-11-17",
		},
		{
			slug: "keys-for-a-team",
			title: "API keys for a team",
			summary:
				"Give each app and environment its own limited key, use management keys for automation, and rotate keys without downtime.",
			minutes: 8,
			body: `Owners and admins create API keys in **Settings → API Keys**. Use **one key per app and environment**, not one shared key for everyone. Then you can see each key's usage, limit it, and replace it without touching anything else. The secret is shown only once, so it goes straight into your secrets manager.

Every key can have daily, weekly or monthly limits on requests and on spend. They are checked on every request and reset at UTC midnight, Monday or the 1st of the month. When a limit is reached, requests with that key are refused until the window resets. **Key Security** lists keys that could do damage if they leaked: no spend limit, no expiry, idle for 90 days or more, or usable from any IP address.

For automation, such as a script that creates keys or reads usage, use a **management key** from **Settings → Management Keys**. Management keys can't send model requests. Pick a template: **Read**, **Write** (no delete) or **All**, or choose just the capabilities you need. A management key can never do more than the role of the person behind it allows.

To replace a key, select **Rotate**. Phaseo creates a replacement with the same limits and lets you choose when the current key expires: immediately, in 1 hour, 24 hours or 7 days, at a time you pick, or never. Move your apps to the new key before the old one expires. You can also pause a key and resume it later, or delete it for good. A revoked key can't be turned back on.`,
			quiz: {
				question: "Your team wants a nightly script that creates and deletes API keys. Which credential should it use?",
				options: [
					"A normal API key with a high spend limit.",
					"A management key with only the key capabilities it needs.",
					"A management key with the All template, so it never fails.",
				],
				answer: 1,
				explanation:
					"Only management keys can call the administration APIs, and normal API keys can't. Give it the narrowest set of capabilities that works, and keep All for trusted admin automation.",
			},
			scenario: {
				prompt:
					"A developer tells you the production API key was pushed to a public repository an hour ago. What do you do?",
				answer:
					"Rotate the key straight away and choose to expire the current key immediately. Put the new secret in your secrets manager and update the app. Then check the key's requests in Settings → Logs for anything you don't recognise. Rotate first, investigate second.",
			},
			takeaway:
				"One key per app and environment, each with a spend limit, makes leaks small and rotation painless.",
			links: [
				{ label: "Authentication and keys", href: `${DOCS}/developers/authentication` },
				{ label: "Management API keys", href: `${DOCS}/developers/management-api-keys` },
				{ label: "API Keys", href: "/settings/keys" },
				{ label: "Key Security", href: "/settings/security" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "budgets-and-spend-rules",
			title: "Budgets and spend rules",
			summary:
				"Use credits, budgets and key limits for hard caps, and spend rules for early warnings.",
			minutes: 9,
			body: `Paid models are paid for from your workspace's credit balance. You top it up in **Settings → Billing & Credits**, which also has a simple low-balance email. Free models don't need credits.

Phaseo has two kinds of hard cap. Both are checked on every request, so spend can't run past them:

- **Workspace budgets** in **Settings → Budgets**: a daily, weekly, monthly or lifetime limit for the whole workspace. The page shows spend so far, the share used and a projection.
- **Key limits**: request and spend limits on one API key.

**Spend rules** warn you before you hit a cap. Open **Settings → Notifications → Spend alerts** and select **Add alert**. A rule picks whose spend counts (the workspace, one key, one member, a department, a model or a provider), a period, and thresholds. It can alert on spend, on a share of a budget, on a forecast for the period, on a sudden spike, or on a low balance. Members can see rules; owners and admins create and change them.

A rule can also block requests once spend passes a limit. Blocking is best effort: rules run on recorded usage a few minutes after requests finish, so spend can go a little past the limit first. Use budgets and key limits for exact caps, and blocking rules for wider scopes such as one member. Spend alerts and blocking are still being rolled out; until they are switched on for you, rules are saved but not run.

To limit how fast someone can send requests, rather than how much they spend, use **Settings → Rate limits**. A policy can set requests per minute, tokens per minute or concurrent requests for a key, a member, a department or each of your end users. Guardrails never cap spend.`,
			quiz: {
				question: "You need a monthly cap for the whole workspace that is checked on every request. What do you use?",
				options: [
					"A monthly workspace budget.",
					"A spend rule with the block action.",
					"A guardrail with a spend limit.",
				],
				answer: 0,
				explanation:
					"Workspace budgets and key limits are checked on every request. A blocking spend rule starts a few minutes after the limit is passed, and guardrails have no spend limits at all.",
			},
			scenario: {
				prompt:
					"A new team member is experimenting with large models. You want a warning when their monthly spend reaches $200, and their requests stopped if it reaches $250. How do you set it up?",
				answer:
					"Add a spend rule scoped to that member, with a monthly period, an alert threshold of $200 and the block action at $250. Remember that the block starts a few minutes late. If you need an exact cap, also set a monthly spend limit on the keys they use.",
			},
			takeaway:
				"Budgets and key limits are your hard stops; spend rules are the early warning in front of them.",
			links: [
				{ label: "Spend alerts guide", href: `${DOCS}/guides/spend-alerts` },
				{ label: "Key limits and budgets", href: `${DOCS}/api-reference/limits` },
				{ label: "Budgets", href: "/settings/budgets" },
				{ label: "Notifications", href: "/settings/notifications" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "guardrails",
			title: "Guardrails",
			summary:
				"Control which providers and models keys can reach, how data is handled, and what gets flagged, redacted or blocked.",
			minutes: 9,
			body: `A guardrail is a set of rules for API traffic. Create one in **Settings → Guardrails → New Guardrail**. Name it after what it enforces, such as "eu-models-pii-redact", so you can reuse it across keys. A guardrail can set:

- **Provider mode**: allow all providers, only selected ones, or all except selected ones.
- **Model mode**: allow all models, or only selected ones.
- **Data handling**: zero data retention (ZDR) only, and whether endpoints that may train on inputs stay eligible.
- **Prompt injection** and **Sensitive info** checks, such as email addresses, phone numbers or card numbers. Each check can **Flag**, **Redact** or **Block**.

Use the preview to test a harmless input, one that should be stopped, and a real prompt before you save. Then attach the guardrail under **Apply to keys**, or under **Apply to members** to cover every key those members create. Members can't edit or remove a guardrail an owner or admin assigned to them.

Rules in **Settings → Privacy** apply to every request in the workspace, and a guardrail can only narrow them. When several guardrails apply to the same key, for example one on the key and one on its creator, all of them count and the strictest result wins. A model must be allowed by every guardrail, blocked providers add up, ZDR is required if any guardrail requires it, and the strongest action (Block over Redact over Flag) is used.

Start small: attach a new guardrail to one low-risk key, and check **Settings → Usage → Guardrail Activity** and the request logs before you widen it. A turned-off guardrail keeps its settings but isn't enforced. Guardrails don't cap spend; use budgets and key limits for that.`,
			quiz: {
				question:
					"A key's own guardrail allows models A and B. Its creator's member guardrail allows only model B. Which models can the key use?",
				options: ["A and B", "Only B", "Neither, because the guardrails conflict"],
				answer: 1,
				explanation:
					"All guardrails that apply to a key count, and the strictest wins. A model has to be allowed by every one of them, so only B is left.",
			},
			scenario: {
				prompt:
					"Your legal team wants email addresses and phone numbers removed from prompts, and only zero-data-retention providers used. You don't want to break the support bot while you roll it out. What's your plan?",
				answer:
					"Create one guardrail with ZDR only and Sensitive info on Redact for email and phone. Test it in the preview with a harmless, a sensitive and a real prompt. Attach it to a staging or low-risk key first, check Guardrail Activity and the logs, then attach it to the support bot's key and the other keys that need it.",
			},
			takeaway:
				"Guardrails stack: every one that applies counts, so build small, clearly named policies and roll them out one key at a time.",
			links: [
				{ label: "Roll out guardrails", href: `${DOCS}/cookbook/guardrails-for-api-keys` },
				{ label: "Guardrails API overview", href: `${DOCS}/api-reference/endpoint/guardrails` },
				{ label: "Guardrails", href: "/settings/guardrails" },
				{ label: "Privacy", href: "/settings/privacy" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "routing-defaults-and-auto-routing",
			title: "Routing defaults, presets and Auto Routing",
			summary:
				"Set how your workspace picks providers, share configurations with presets, and let Auto Routing pick the model.",
			minutes: 8,
			body: `Most models are served by several providers. In **Settings → Routing** you choose how your workspace ranks them by default: **balanced** (the default, cost per successful answer), **price**, **latency** or **throughput**. A single request can ask for a different mode, but your allow lists, guardrails and price ceilings still apply. The same page has toggles for beta and alpha providers, so preview providers only get traffic when you opt in.

A **preset** saves the model, system prompt, parameters and provider rules for one job under a name such as "@support-triage". Create presets in **Settings → Presets**. Apps send the preset's name instead of a model, so you can change the model or prompt in one place without a redeploy. Each **Publish new version** keeps the earlier ones. Point a label such as "production" at a version, and move it back to roll back.

**Auto Routing** lets Phaseo pick the model for each request when an app sends "phaseo/auto". It is in [Alpha](https://phaseo.app/docs/v1/developers/feature-maturity) and turned on per workspace on request. In **Settings → Routing → Auto routing** you choose:

- an **objective**: balanced, quality, cost or latency;
- a **spend profile**: a hard price ceiling (Economy, Standard, Premium, Any price or Custom). Models above it are never considered;
- optional model patterns to narrow the choice, and whether to fall back to the next model on errors.

Requests can't change these settings, and every candidate still passes your privacy rules and guardrails. Check the model mix against your own work, because the settings decide which models are eligible, not how good the answers are.`,
			quiz: {
				question: "Your workspace uses Auto Routing with the Economy spend profile. What does that profile do?",
				options: [
					"It sets a hard price ceiling, so models above it are never considered.",
					"It is a preference that a request can override with its own objective.",
					"It makes Auto Routing skip guardrails to save time.",
				],
				answer: 0,
				explanation:
					"Spend profiles are hard ceilings on standard text prices. Requests can't change the workspace's objective, spend profile or patterns, and every candidate still goes through your guardrails.",
			},
			scenario: {
				prompt:
					"Three apps use the same model and system prompt for ticket triage. You want to try a newer model without asking each team to redeploy, and undo it quickly if answers get worse. What do you set up?",
				answer:
					"Create a preset, for example @support-triage, and have the apps call it by name. Publish a new version with the newer model and move the production label to it. If answers get worse, move the label back to the earlier version.",
			},
			takeaway:
				"Set sensible workspace defaults, share setups through presets, and treat Auto Routing as an Alpha you test against your own work.",
			links: [
				{ label: "Routing and fallbacks", href: `${DOCS}/guides/routing-and-fallbacks` },
				{ label: "Presets guide", href: `${DOCS}/guides/presets` },
				{ label: "Auto Routing guide", href: `${DOCS}/guides/auto-routing` },
				{ label: "Routing settings", href: "/settings/routing" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "see-how-ai-is-used",
			title: "See how AI is used",
			summary:
				"Use usage pages, logs, request labels, classifiers and the audit log to see who spends what and who changed what.",
			minutes: 7,
			body: `**Settings → Usage** shows spend and traffic for the workspace you have open, with Overview, Trends, Explore, Geography, Guardrail Activity and Alerts pages. **Settings → Logs** lists each request, with the model and provider that served it, plus sessions, videos, batches and realtime sessions.

To split spend by team, feature or environment, ask your developers to add **request labels**, such as team=support, to their requests. You can then filter logs and usage by those labels. Labels are not sent to providers. Don't put prompts, secrets or personal data in them.

If your apps don't know the category, a **request classifier** can add labels for you. You describe the categories, such as department or task type, and pick a model that labels each finished request. It never slows the request down, and you can set a sample rate and a monthly budget. Owners and admins manage classifiers in **Settings → Classifiers**. Classifiers are in **Beta** and turned on per workspace on request; everything else in this lesson is generally available. See [feature maturity](https://phaseo.app/docs/v1/developers/feature-maturity) for what that means.

Logs show what traffic ran. The **audit log** shows who changed the controls around it. Open **Settings → Activity** to see who created, rotated or deleted a key, changed a member's role, edited a guardrail, published a preset version or lifted a spend block, and when. Only owners and admins can read it. It never stores secrets or request bodies.`,
			quiz: {
				question: "A key's spend limit was raised overnight and nobody remembers doing it. Where do you look?",
				options: [
					"Settings → Logs, filtered to that key.",
					"Settings → Usage → Trends.",
					"Settings → Activity, the workspace audit log.",
				],
				answer: 2,
				explanation:
					"Logs and usage show the requests that ran. Changes to keys, members, guardrails and other controls are recorded in the audit log, with who made them and when.",
			},
			scenario: {
				prompt:
					"Finance wants a monthly split of AI spend by department. Your apps don't send any labels, and the developers are busy for weeks. What can you do?",
				answer:
					"Ask for request classifiers to be turned on (they are in Beta), then create one with a department dimension, a sample rate and a monthly budget. Its answers are stored as request labels, so you can filter usage by department. When the developers have time, they can add their own labels for exact attribution.",
			},
			takeaway:
				"Labels and classifiers explain where spend goes; the audit log explains who changed what.",
			links: [
				{ label: "Request labels", href: `${DOCS}/guides/request-labels` },
				{ label: "Request classifiers", href: `${DOCS}/guides/request-classifiers` },
				{ label: "Workspace audit log", href: `${DOCS}/guides/workspace-audit-log` },
				{ label: "Usage", href: "/settings/usage/overview" },
			],
			updated: "2026-11-17",
		},
	],
};
