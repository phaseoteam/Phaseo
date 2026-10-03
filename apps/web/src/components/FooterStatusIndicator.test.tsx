import { renderToStaticMarkup } from "react-dom/server";
import { useQuery } from "@tanstack/react-query";
import messages from "../../messages/en-GB/common.json";
import { FooterStatusIndicator } from "./FooterStatusIndicator";

jest.mock("@tanstack/react-query", () => ({ useQuery: jest.fn() }), { virtual: true });
jest.mock("next-intl", () => ({
	useTranslations: () => (key: string, values?: Record<string, string>) => {
		const message = key.split(".").reduce((value, part) => value[part], messages.status as any) as string;
		return message.replace(/\{(\w+)\}/g, (_match, name: string) => values?.[name] ?? name);
	},
}), { virtual: true });
jest.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("FooterStatusIndicator", () => {
	it("renders recovery progress, the update and retained component impact", () => {
		jest.mocked(useQuery).mockReturnValue({ data: {
			ok: true, state: "monitoring", label: "Monitoring recovery", href: "https://status.phaseo.app",
			incidents: [{ id: "1", name: "API disruption", status: "monitoring", impact: "Major outage", message: "A fix has been applied.", updatedAt: "2026-10-03T09:33:04.331Z" }],
			components: [{ name: "Models API (/v1/models)", state: "major_outage", label: "Major outage", parent: "APIs" }],
		}, error: undefined } as ReturnType<typeof useQuery>);
		const markup = renderToStaticMarkup(<FooterStatusIndicator />);
		expect(markup).toContain("Monitoring recovery");
		expect(markup).toContain("API disruption");
		expect(markup).toContain("Reported impact: Major outage");
		expect(markup).toContain("A fix has been applied.");
		expect(markup).toMatch(/datetime="2026-10-03T09:33:04.331Z"/i);
		expect(markup).toContain("Models API (/v1/models)");
	});

	it("handles summaries without incident details", () => {
		jest.mocked(useQuery).mockReturnValue({ data: {
			ok: true, state: "operational", label: "All systems operational", href: "https://status.phaseo.app",
		}, error: undefined } as ReturnType<typeof useQuery>);
		expect(renderToStaticMarkup(<FooterStatusIndicator />)).toContain("All systems operational");
	});
});
