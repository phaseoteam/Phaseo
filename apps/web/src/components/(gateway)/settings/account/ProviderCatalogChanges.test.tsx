import { renderToStaticMarkup } from "react-dom/server";
import ProviderCatalogChanges from "./ProviderCatalogChanges";
import type { ProviderManagedCatalog } from "@/app/(dashboard)/settings/account/providers/actions";
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en-GB" }));
describe("provider catalog override display", () => {
	it("shows attribution, feed values and effective values without rendering HTML", () => {
		const catalog = { source: { last_success_at: "2026-10-07T00:00:00Z" }, overrides: { "acme/model": { name: { value: "<script>corrected</script>", actor_name: "Operator", actor_kind: "phaseo", edited_at: "2026-10-07T00:00:00Z" } } }, feed_models: [{ id: "acme/model", name: "Original feed name" }], activity: [] } as unknown as ProviderManagedCatalog;
		const html = renderToStaticMarkup(<ProviderCatalogChanges catalog={catalog} modelId="acme/model" disabled={false} onRevert={() => {}} />);
		expect(html).toContain("Operator"); expect(html).toContain("Original feed name");
		expect(html).toContain("effectiveValue"); expect(html).toContain("useFeedValue");
		expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>corrected");
	});
	it("disables reversion while a draft is being edited", () => {
		const catalog = { source: {}, overrides: { "acme/model": { name: { value: "Corrected", actor_kind: "provider", edited_at: "2026-10-07T00:00:00Z" } } }, feed_models: [], activity: [] } as unknown as ProviderManagedCatalog;
		expect(renderToStaticMarkup(<ProviderCatalogChanges catalog={catalog} modelId="acme/model" disabled onRevert={() => {}} />)).toContain('disabled=""');
	});
});
