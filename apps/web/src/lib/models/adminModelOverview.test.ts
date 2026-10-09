import { toAdminModelOverview } from "./adminModelOverview";
import type { AdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";

it("normalizes an internal source for the standard model overview without claiming availability", () => {
	const source = { canonicalApiId: "test/staged", model: { hidden: true, model_id: "test/staged", name: "Staged", lab_slug: "test", lab: { name: "Test lab" }, status: "draft" }, aliases: [{ alias_slug: "test-preview" }], links: [], details: [] } as unknown as AdminModelSource;
	expect(toAdminModelOverview(source)).toMatchObject({ model_id: "test/staged", organisation: { name: "Test lab" }, status: "Withheld", aliases: ["test-preview"], model_links: [], model_details: [] });
	expect(toAdminModelOverview({ ...source, model: { ...source.model, hidden: false } })).toBeNull();
});

it("shows catalogue availability independently of hidden visibility", () => {
	const source = { canonicalApiId: "test/internal", model: { hidden: true, model_id: "test/internal", lab_slug: "test", status: "active", catalogue_status: "available" }, aliases: [] } as unknown as AdminModelSource;
	expect(toAdminModelOverview(source)).toMatchObject({ hidden: true, status: "Available" });
	expect(toAdminModelOverview({ ...source, model: { ...source.model, catalogue_status: "preview" } })).toMatchObject({ hidden: true, status: "Preview" });
});
