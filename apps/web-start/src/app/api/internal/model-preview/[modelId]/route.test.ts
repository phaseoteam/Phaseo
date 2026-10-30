import { GET } from "./route";
import { isAdminViewer } from "@/lib/auth/getViewerRole";
import { fetchAdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";

jest.mock("@/lib/auth/getViewerRole", () => ({ isAdminViewer: jest.fn() }));
jest.mock("@/lib/fetchers/internal/fetchAdminModelSource", () => ({ fetchAdminModelSource: jest.fn() }));

const admin = jest.mocked(isAdminViewer);
const fetchSource = jest.mocked(fetchAdminModelSource);
const context = { params: Promise.resolve({ modelId: "internal/revalidation-test" }) };

describe("hidden model preview API", () => {
	beforeEach(() => jest.clearAllMocks());

	it("returns 404 without fetching data for non-admins", async () => {
		admin.mockResolvedValue(false);
		const response = await GET(new Request("https://phaseo.app/api/internal/model-preview/test"), context);
		expect(response.status).toBe(404);
		expect(fetchSource).not.toHaveBeenCalled();
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});

	it("returns only preview fields to admins", async () => {
		admin.mockResolvedValue(true);
		fetchSource.mockResolvedValue({
			requestedModelId: "internal/revalidation-test", canonicalApiId: "internal/revalidation-test", internalModelId: "internal/revalidation-test",
			model: { model_id: "internal/revalidation-test", name: "Test model", hidden: true, secret: "never-return" },
			providerRows: [], pricingRules: [], subscriptionPlans: [], aliases: [],
		});
		const response = await GET(new Request("https://phaseo.app/api/internal/model-preview/test"), context);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ modelId: "internal/revalidation-test", name: "Test model", status: null, providers: [] });
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});

	it("does not serve visible models through the admin preview endpoint", async () => {
		admin.mockResolvedValue(true);
		fetchSource.mockResolvedValue({
			requestedModelId: "public/model", canonicalApiId: "public/model", internalModelId: "public/model",
			model: { model_id: "public/model", name: "Public model", hidden: false },
			providerRows: [], pricingRules: [], subscriptionPlans: [], aliases: [],
		});
		const response = await GET(new Request("https://phaseo.app/api/internal/model-preview/test"), context);
		expect(response.status).toBe(404);
	});
});
