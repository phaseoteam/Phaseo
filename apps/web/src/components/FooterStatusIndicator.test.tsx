import { renderToStaticMarkup } from "react-dom/server";
import useSWR from "swr";
import { FooterStatusIndicator } from "./FooterStatusIndicator";

jest.mock("swr", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("FooterStatusIndicator", () => {
	it("renders recovery progress, the update and retained component impact", () => {
		jest.mocked(useSWR).mockReturnValue({ data: {
			ok: true, state: "monitoring", label: "Monitoring recovery", href: "https://status.phaseo.app",
			incidents: [{ id: "1", name: "API disruption", status: "monitoring", impact: "Major outage", message: "A fix has been applied.", updatedAt: "2026-10-03T09:33:04.331Z" }],
			components: [{ name: "Models API (/v1/models)", state: "major_outage", label: "Major outage", parent: "APIs" }],
		}, error: undefined } as ReturnType<typeof useSWR>);
		const markup = renderToStaticMarkup(<FooterStatusIndicator />);
		expect(markup).toContain("Monitoring recovery");
		expect(markup).toContain("API disruption");
		expect(markup).toContain("Reported impact: Major outage");
		expect(markup).toContain("A fix has been applied.");
		expect(markup).toMatch(/datetime="2026-10-03T09:33:04.331Z"/i);
		expect(markup).toContain("Models API (/v1/models)");
	});

	it("handles summaries without incident details", () => {
		jest.mocked(useSWR).mockReturnValue({ data: {
			ok: true, state: "operational", label: "All systems operational", href: "https://status.phaseo.app",
		}, error: undefined } as ReturnType<typeof useSWR>);
		expect(renderToStaticMarkup(<FooterStatusIndicator />)).toContain("All systems operational");
	});
});
