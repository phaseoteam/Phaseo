import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import site from "../../../messages/en-GB/site.json";
import { AppIntlProvider } from "@/i18n/react";
import { METHODOLOGY_ENTRIES } from "@/lib/content/methodology";
import { MethodologyArticlePage } from "./MethodologyArticlePage";

vi.mock("@/i18n/navigation", () => ({
	Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

describe("MethodologyArticlePage", () => {
	it.each(METHODOLOGY_ENTRIES.map((entry) => [entry.slug, entry] as const))("translates every heading and link on %s", (slug, entry) => {
		const html = renderToStaticMarkup(
			<AppIntlProvider locale="en-GB" timeZone="UTC" messages={{ Site: site }}>
				<MethodologyArticlePage entry={entry} />
			</AppIntlProvider>,
		);
		const copy = site.methodology.entries[slug as keyof typeof site.methodology.entries];

		expect(html).not.toContain("Site.methodology");
		for (const heading of Object.values(copy.sections)) expect(html).toContain(`>${heading}</h2>`);
		for (const label of Object.values(copy.related)) expect(html).toContain(label);
	});
});
