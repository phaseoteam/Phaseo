import SiteNoticeSlot from "./SiteNoticeSlot";
import { connection } from "next/server";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";
import { getActiveSiteNotice, SITE_NOTICES } from "@/lib/siteNotice";

jest.mock("next/server", () => ({ connection: jest.fn().mockResolvedValue(undefined) }));
jest.mock("./SiteNoticeBar", () => ({ __esModule: true, default: () => null }));
jest.mock("@/lib/fetchers/internal/fetchInternalAuthStatus", () => ({ fetchInternalAuthStatus: jest.fn() }));
jest.mock("@/lib/siteNotice", () => ({
	SITE_NOTICES: [{ enabled: false }],
	getActiveSiteNotice: jest.fn(),
}));

describe("site notice rendering", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		SITE_NOTICES[0].enabled = false;
	});

	it("keeps disabled notices out of dynamic rendering and authentication", async () => {
		expect(await SiteNoticeSlot()).toBeNull();
		expect(connection).not.toHaveBeenCalled();
		expect(fetchInternalAuthStatus).not.toHaveBeenCalled();
		expect(getActiveSiteNotice).not.toHaveBeenCalled();
	});

	it("still checks authentication for enabled notices", async () => {
		SITE_NOTICES[0].enabled = true;
		jest.mocked(fetchInternalAuthStatus).mockResolvedValue({ isAdmin: false, role: "user", signedIn: true });
		jest.mocked(getActiveSiteNotice).mockReturnValue(null);
		expect(await SiteNoticeSlot()).toBeNull();
		expect(connection).toHaveBeenCalledTimes(1);
		expect(getActiveSiteNotice).toHaveBeenCalledWith(true);
	});
});
