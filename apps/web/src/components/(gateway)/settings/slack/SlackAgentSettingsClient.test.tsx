import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import settingsMessages from "../../../../../messages/en-GB/settings-ui.json";
import commonMessages from "../../../../../messages/en-GB/common.json";
import SlackAgentSettingsClient from "./SlackAgentSettingsClient";
import type { SlackAgentCharge, SlackAgentInstallation, SlackAgentManagerView } from "./slackAgentForm";

jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock("@/app/(dashboard)/settings/slack/actions", () => ({
	startSlackInstall: jest.fn(),
	updateSlackAgent: jest.fn(),
	uninstallSlackAgent: jest.fn(),
	saveSlackCustomApp: jest.fn(),
	removeSlackCustomApp: jest.fn(),
}));
jest.mock("../PrivateSettingsQuery", () => ({
	useSettingsWrite: () => (operation: Promise<unknown>) => operation,
}));
jest.mock("@/i18n/navigation", () => ({
	Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

const MONTH = { period_start: "2026-10-01", people: 4, answers: 1_500, estimated_charge_usd: 3.065 };

function installation(month: SlackAgentInstallation["month"], settings: Partial<SlackAgentInstallation["settings"]> = {}): SlackAgentInstallation {
	return {
		id: "i1", team_id: "T0TEAM0001", team_name: "Acme", enterprise_id: null, bot_user_id: "U0BOT0001", status: "active",
		installed_at: "2026-10-01T00:00:00Z", uses_custom_app: false, plan: { people: 10, price_usd: 2.99 }, month,
		settings: {
			plan_people: 10, over_plan: "refuse", max_people: null, monthly_cap_usd: 25, answers_per_person_hour: 60, model: "phaseo/auto",
			model_choice_enabled: false, allowed_models: [],
			instructions: null, access_mode: "everyone", usage_data_mode: "dm", usage_data_channel_ids: [], allow_guests: true,
			allow_external_users: false, token_monthly_limit_usd: 40, ...settings,
		},
	};
}

function charge(overrides: Partial<SlackAgentCharge>): SlackAgentCharge {
	return { period_start: "2026-09-01", people: 3, answers: 200, amount_usd: 0.99, status: "charged", charged_at: "2026-10-01T01:00:00Z", ...overrides };
}

// No garbage-collection timers, so Jest can exit after the static renders.
const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
afterAll(() => queryClient.clear());

function render(month: SlackAgentInstallation["month"], charges: SlackAgentCharge[] = [], settings: Partial<SlackAgentInstallation["settings"]> = {}, autoRouting = false) {
	const view: SlackAgentManagerView = {
		workspaceId: "w1", canManage: true, configured: { hosted_app: true, custom_app: true }, redirect_url: "https://phaseo.app/callback",
		scopes: [], auto_routing: autoRouting, installed: true, installation: installation(month, settings), custom_app: null, charges,
	};
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ SettingsUI: settingsMessages, Common: commonMessages }}>
				<SlackAgentSettingsClient view={view} />
			</NextIntlClientProvider>
		</QueryClientProvider>,
	);
}

describe("SlackAgentSettingsClient model spend", () => {
	it("shows this month's model spend in dollars, apart from the Slack agent charge", () => {
		const html = render({ ...MONTH, model_spend_usd: 12.5, model_requests: 812 });
		expect(html).toContain(">Model spend<");
		expect(html).toContain(">$12.50<");
		expect(html).toContain("Billed from credits as normal requests, not part of the Slack agent charge");
		expect(html).toContain(">$3.07<");
		expect(html).not.toMatch(/rounded-(full|lg|xl)\b/);
	});

	it("adds each past month's model spend to the charges table", () => {
		const html = render({ ...MONTH, model_spend_usd: 0, model_requests: 0 }, [
			charge({ model_spend_usd: 1_234.5 }),
			charge({ period_start: "2026-08-01", model_spend_usd: 0 }),
		]);
		expect(html).toMatch(/<th[^>]*>Model spend<\/th>/);
		expect(html).toContain(">$1,234.50<");
		expect(html).toContain("Model spend is billed from credits as normal requests and is not part of the amount.");
		// The month stat and the August row are both zero.
		expect(html.match(/>\$0\.00</g)).toHaveLength(2);
	});

	it("says the spend is unavailable instead of showing $0.00 when it couldn't be read", () => {
		const html = render({ ...MONTH, model_spend_usd: null, model_requests: null }, [charge({ model_spend_usd: null }), charge({ period_start: "2026-08-01" })]);
		expect(html.match(/>Unavailable</g)).toHaveLength(3);
		expect(html).not.toContain(">$0.00<");
	});
});

describe("SlackAgentSettingsClient model choice", () => {
	it("is a switch that is off by default, with no model list", () => {
		const html = render(MONTH);
		expect(html).toMatch(/<h2[^>]*>Model choice<\/h2>/);
		expect(html).toContain("Let people choose a model per message");
		// The prefix is shown as typed; next-intl doesn't read it as markup.
		expect(html).toContain("People put with &lt;model&gt;: at the start of a message, naming an allowed model by its name or ID.");
		expect(html).not.toContain("Models people can choose");
	});

	it("lists the allowed models, with Auto where the workspace has it, and the answer limits in dollars", () => {
		const html = render(MONTH, [], { model_choice_enabled: true, allowed_models: ["openai/gpt-6-luna", "phaseo/auto"] }, true);
		expect(html).toContain("Models people can choose (2 of 10)");
		expect(html).toContain(">openai/gpt-6-luna<");
		expect(html).toContain('aria-label="Remove Auto"');
		expect(html).toContain("Include Auto");
		expect(html).toContain("Each answer keeps its $0.50 cost limit and 12-step limit, whichever model answers.");
		expect(html).not.toContain("so messages that choose it can");
		expect(html).not.toMatch(/rounded-(full|lg|xl)\b/);
	});

	it("warns when Auto is allowed but the workspace no longer has it, and stops adding at 10", () => {
		const ten = [...Array.from({ length: 9 }, (_, index) => `acme/model-${index}`), "phaseo/auto"];
		const html = render(MONTH, [], { model_choice_enabled: true, allowed_models: ten }, false);
		expect(html).toContain("so messages that choose it can&#x27;t be answered. Turn off Include Auto.");
		expect(html).toContain("You can allow up to 10 models. Remove one to add another.");
		expect(html).not.toContain('aria-label="Add a model"');
	});
});
