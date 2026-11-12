import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProviderCatalogCapabilities from "./ProviderCatalogCapabilities";

describe("provider catalog capabilities", () => {
	it("offers both the endpoint alias's and the canonical capability's parameters", () => {
		const html = renderToStaticMarkup(<ProviderCatalogCapabilities
			value={[{ id: "chat.completions", parameters: ["seed"] }]}
			options={{ "chat.completions": ["temperature", "verbosity"], "text.generate": ["temperature", "top_k"] }}
			disabled={false}
			label="Capabilities"
			onChange={() => {}}
		/>);
		const chat = html.slice(html.indexOf("<code>chat.completions</code>"), html.indexOf("<code>text.generate</code>"));
		for (const parameter of ["seed", "temperature", "top_k", "verbosity"]) expect(chat).toContain(`<code>${parameter}</code>`);
		expect(chat.match(/<code>temperature<\/code>/g)).toHaveLength(1);
	});
});
