import { expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SubscriptionPlanCompare from "./SubscriptionPlanCompare";
import type { RelatedSubscriptionPlan } from "@/lib/fetchers/subscription-plans/types";

vi.mock("@/i18n/react", () => ({
	useLocale: () => "en-GB",
	useTranslations: () => (key: string) => ({ "Common.ui.subscriptionCatalog.seat": "Seat" }[key] ?? key),
}));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a> }));
vi.mock("@/components/providers/DisplayPreferencesProvider", () => ({
	useDisplayFormatters: () => ({ number: (value: number, options: Intl.NumberFormatOptions) => new Intl.NumberFormat("en-US", options).format(value), date: String }),
}));

const plan = (plan_id: string, total: number | null, account: number | null, seat: number | null): RelatedSubscriptionPlan =>
	({ plan_id, name: plan_id, monthly_price_usd: total, account_price_usd: account, seat_price_usd: seat, usage: [] });

test("labels seat prices and keeps account and seat charges apart", () => {
	const html = renderToStaticMarkup(<SubscriptionPlanCompare planId="pro" provider="Lab" plans={[
		plan("pro", 20, 20, 0),
		plan("team", 25, 0, 25),
		plan("teams-mixed", 120, 80, 40),
		plan("enterprise", null, null, null),
	]} />);
	expect(html).toContain("$20 / month");
	expect(html).toContain("$25 / Seat / month");
	expect(html).toContain("$80 + $40 / Seat / month");
	expect(html).not.toContain("$120");
});
