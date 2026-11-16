import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgentPromptPanel } from "./AgentPromptPanel";
import { buildAgentPrompt } from "./agentPrompt";

vi.mock("@/i18n/react", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/productAnalytics", () => ({ captureProductEvent: vi.fn() }));

const escapeHtml = (text: string) =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("AgentPromptPanel", () => {
	it("renders one prompt for the model with a single copy button", () => {
		const html = renderToStaticMarkup(
			<AgentPromptPanel
				modelId="openai/gpt-6-astra"
				endpointPath="/responses"
				analyticsModelId="openai/gpt-6-astra"
			/>,
		);
		expect(html).toContain(
			escapeHtml(buildAgentPrompt({ modelId: "openai/gpt-6-astra", endpointPath: "/responses" })),
		);
		expect(html).toContain("agentPromptTitle");
		expect(html.match(/copyPrompt/g)).toHaveLength(1);
		expect(html).not.toContain("combobox");
	});
});
