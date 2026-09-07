import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import type { RequestRow } from "@/app/(dashboard)/gateway/usage/server-actions";
import RequestDetailDialog from "./RequestDetailDialog";
import { RouteRequestDetailErrorDialog } from "./RouteRequestDetailDialog";

const router = {
	push: jest.fn(),
	refresh: jest.fn(),
};

jest.mock("next/navigation", () => ({
	useRouter: () => router,
	useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/components/ui/dialog", () => ({
	Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
	DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

jest.mock("@/components/(data)/model/pricing/ProviderInspectorSheet", () => ({
	ProviderInspectorSheet: ({ children, ...props }: { children: React.ReactNode; disablePointerDismissal?: boolean }) => (
		<div data-disable-pointer-dismissal={String(props.disablePointerDismissal)}>{children}</div>
	),
	ProviderInspectorSheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const historicalRequestWithoutCollections = {
	request_id: "req_historical",
	created_at: "2026-08-11T12:00:00.000Z",
	endpoint: null,
	model_id: null,
	provider: null,
	app_id: null,
	session_id: null,
	success: true,
	status_code: 200,
	error_code: null,
	error_message: null,
	error_payload: null,
	usage: null,
	cost_nanos: null,
} as RequestRow;

describe("RequestDetailDialog", () => {
	it("opens a historical request when optional collections are absent", () => {
		expect(() =>
			renderToStaticMarkup(
				<RequestDetailDialog
					open
					onOpenChange={() => {}}
					request={historicalRequestWithoutCollections}
				/>,
			),
		).not.toThrow();
	});

	it("keeps the loading sheet from dismissing during request transitions", () => {
		const markup = renderToStaticMarkup(
			<RequestDetailDialog
				open
				loading
				presentation="sheet"
				disablePointerDismissal
				onOpenChange={() => {}}
				request={historicalRequestWithoutCollections}
			/>,
		);

		expect(markup).toContain('data-disable-pointer-dismissal="true"');
	});

	it("renders a retryable state when a route detail cannot load", () => {
		const markup = renderToStaticMarkup(
			<RouteRequestDetailErrorDialog closeHref="/settings/usage/logs/requests" />,
		);

		expect(markup).toContain("Request details unavailable");
		expect(markup).toContain("Try again");
		expect(markup).toContain("Back to request logs");
	});
});
