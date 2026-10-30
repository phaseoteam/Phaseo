import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

/** The enterprise self-serve preview is a flag (@/lib/flags), read on the server. */
export const getEnterpriseSelfServePreview = createServerFn({ method: "GET" }).handler(async () => {
	const { enterpriseSelfServePreviewEnabled } = await import("@/lib/flags");
	return enterpriseSelfServePreviewEnabled();
});

export const enterpriseSelfServePreviewQuery = () =>
	queryOptions({
		queryKey: ["flags", "enterprise-self-serve-preview"],
		queryFn: () => getEnterpriseSelfServePreview(),
	});
