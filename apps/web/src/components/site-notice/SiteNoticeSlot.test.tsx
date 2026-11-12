import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SiteNoticeSlot from "./SiteNoticeSlot";
import { shellDataQuery } from "@/components/header/shellData";
import { getActiveSiteNotice, SITE_NOTICES } from "@/lib/siteNotice";

vi.mock("./SiteNoticeBar", () => ({ default: () => null }));
vi.mock("@/i18n/react", () => ({ useLocale: () => "en-GB" }));
vi.mock("@/lib/siteNotice", () => ({
	SITE_NOTICES: [{ enabled: false }],
	getActiveSiteNotice: vi.fn(),
}));

describe("site notice rendering", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		SITE_NOTICES[0].enabled = false;
	});

	it("keeps disabled notices out of dynamic rendering and authentication", () => {
		expect(SiteNoticeSlot()).toBeNull();
		expect(getActiveSiteNotice).not.toHaveBeenCalled();
	});

	it("still checks authentication for enabled notices", () => {
		SITE_NOTICES[0].enabled = true;
		vi.mocked(getActiveSiteNotice).mockReturnValue(null);
		// The signed-in state comes from the shell data the root loader fetched.
		const queryClient = new QueryClient();
		queryClient.setQueryData(shellDataQuery("en-GB").queryKey, { account: { isLoggedIn: true } } as never);
		const html = renderToStaticMarkup(<QueryClientProvider client={queryClient}><SiteNoticeSlot /></QueryClientProvider>);
		expect(html).toBe("");
		expect(getActiveSiteNotice).toHaveBeenCalledWith(true);
	});
});
