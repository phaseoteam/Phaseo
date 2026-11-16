import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgentPromptPanel } from "./AgentPromptPanel";
import { buildAgentSetupPrompt } from "./agentPrompt";

vi.mock("@/i18n/react", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/productAnalytics", () => ({ captureProductEvent: vi.fn() }));
vi.mock("./QuickstartUsageSection", () => ({
	getLanguageFamilyVisual: () => ({ kind: "logo", logoId: "x", alt: "x" }),
	OptionLabel: ({ label }: { label: string }) => <span>{label}</span>,
}));

const families = [
	{ id: "typescript", label: "TypeScript" },
	{ id: "python", label: "Python" },
];

const escapeHtml = (text: string) =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("AgentPromptPanel", () => {
	it("renders the selected language's setup prompt and a model task prompt", () => {
		const html = renderToStaticMarkup(
			<AgentPromptPanel
				families={families}
				selectedFamilyId="python"
				onSelectFamily={() => {}}
				modelId="openai/gpt-6-astra"
				endpointPath="/responses"
				analyticsModelId="openai/gpt-6-astra"
			/>,
		);
		expect(html).toContain(escapeHtml(buildAgentSetupPrompt("python")));
		expect(html).toContain("sends a prompt to openai/gpt-6-astra");
		expect(html).toContain("agentPromptTitle");
		expect(html.match(/copyPrompt/g)).toHaveLength(2);
	});

	it("renders nothing when no language has an agent prompt", () => {
		const html = renderToStaticMarkup(
			<AgentPromptPanel
				families={[{ id: "rust", label: "Rust" }]}
				selectedFamilyId="rust"
				onSelectFamily={() => {}}
				modelId="x/y"
				endpointPath="/responses"
				analyticsModelId="x/y"
			/>,
		);
		expect(html).toBe("");
	});
});
