import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import settingsMessages from "../../../../../messages/en-GB/settings-ui.json";
import commonMessages from "../../../../../messages/en-GB/common.json";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { DEFAULT_DISPLAY_PREFERENCES, formatDisplayDateParts, formatDisplayNumber } from "@/lib/displayPreferences";
import type { SettingsBudgetsInitialData, SettingsWorkspaceBudget } from "@/lib/fetchers/internal/settingsTypes";
import BudgetsSettingsClient from "./BudgetsSettingsClient";

jest.mock("@/components/providers/DisplayPreferencesProvider", () => ({ useDisplayFormatters: jest.fn() }));
jest.mock("@/app/(dashboard)/settings/budgets/actions", () => ({
	createWorkspaceBudget: jest.fn(),
	updateWorkspaceBudget: jest.fn(),
	deleteWorkspaceBudget: jest.fn(),
}));
jest.mock("../PrivateSettingsQuery", () => ({ useSettingsWrite: () => (operation: Promise<unknown>) => operation }));
jest.mock("@/i18n/navigation", () => ({
	Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

// Wednesday 21 Oct, 12:00 UTC: 20.5 of 31 days into the month.
const OBSERVED_AT = "2026-10-21T12:00:00Z";

function budget(overrides: Partial<SettingsWorkspaceBudget>): SettingsWorkspaceBudget {
	return {
		id: "b-month", interval: "monthly", limit_usd: 100, limit_nanos: 100e9, usage_usd: 80, usage_nanos: 80e9,
		remaining_nanos: 20e9, percent_used: 80, exceeded: false, window_start: "2026-10-01T00:00:00Z",
		reset_at: "2026-11-01T00:00:00Z", created_by: null, created_at: OBSERVED_AT, updated_at: OBSERVED_AT,
		...overrides,
	};
}

function render(data: Partial<SettingsBudgetsInitialData>, renderBudgetActions?: (budget: SettingsWorkspaceBudget) => React.ReactNode) {
	const preferences = { ...DEFAULT_DISPLAY_PREFERENCES, locale: "en-US", timeZone: "UTC" };
	jest.mocked(useDisplayFormatters).mockReturnValue({
		number: (value, options) => formatDisplayNumber(value, preferences, options),
		dateParts: (value, options, fallback) => formatDisplayDateParts(value, preferences, options, fallback),
	} as ReturnType<typeof useDisplayFormatters>);
	return renderToStaticMarkup(
		<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ SettingsUI: settingsMessages, Common: commonMessages }}>
			<BudgetsSettingsClient
				data={{ workspaceId: "w1", canManageBudgets: true, observedAt: OBSERVED_AT, budgets: [], ...data }}
				renderBudgetActions={renderBudgetActions}
			/>
		</NextIntlClientProvider>,
	);
}

describe("BudgetsSettingsClient", () => {
	it("explains exact enforcement, the 429 and UTC resets", () => {
		const html = render({});
		expect(html).toContain("Budgets are enforced exactly");
		expect(html).toContain("with a 429");
		expect(html).toContain("reset on UTC boundaries");
		expect(html).toContain('href="/settings/keys"');
	});

	it("shows a slot for every interval, with Set budget for managers", () => {
		const html = render({});
		for (const interval of ["daily", "weekly", "monthly", "lifetime"]) expect(html).toContain(`id="budget-${interval}"`);
		expect(html.match(/Set budget/g)).toHaveLength(4);
		expect(html).not.toMatch(/rounded-(full|lg|xl)\b/);
	});

	it("shows usage, percent, what is left, the reset and the projection", () => {
		const html = render({ budgets: [budget({})] });
		expect(html).toContain("$80.00");
		expect(html).toContain("of $100.00");
		expect(html).toContain("80% used");
		expect(html).toContain("$20.00 left");
		expect(html).toMatch(/Resets in 10d 12h \(Nov 1, 12:00\s?AM UTC\)|Resets in 10d 12h \(Nov 1, 00:00 UTC\)/);
		// $80 after 20.5 of 31 days → about $120.98 by the reset.
		expect(html).toContain("On pace for $120.98");
		expect(html).toContain("Hits limit ~");
		expect(html).toContain('data-budget-id="b-month"');
		expect(html).toContain(">Edit<");
		expect(html).toContain(">Delete<");
	});

	it("marks used-up budgets and lifetime budgets that never reset", () => {
		const html = render({ budgets: [budget({ id: "b-life", interval: "lifetime", usage_usd: 120, usage_nanos: 120e9, remaining_nanos: 0, percent_used: 120, exceeded: true, window_start: null, reset_at: null })] });
		expect(html).toContain("Used up");
		expect(html).toContain("Never resets");
		expect(html).not.toContain("On pace for");
	});

	it("is read-only for members", () => {
		const html = render({ canManageBudgets: false, budgets: [budget({})] }, () => <button>Alert</button>);
		expect(html).toContain("Only workspace owners and admins can change budgets.");
		expect(html).not.toContain("Set budget");
		expect(html).not.toContain(">Edit<");
		expect(html).not.toContain(">Alert<");
	});

	it("renders extra per-budget actions for managers", () => {
		const html = render({ budgets: [budget({})] }, (row) => <button data-shortcut={row.id}>Alert</button>);
		expect(html).toContain('data-shortcut="b-month"');
	});

	it("asks for a workspace first", () => {
		expect(render({ workspaceId: null })).toContain("Select a workspace to see its budgets.");
	});
});
