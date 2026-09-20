import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { UseQueryResult } from "@tanstack/react-query";
import { PrivateUsageQuery } from "./PrivateUsageQuery";
import { WebApiError } from "@/lib/web-api/client";

const scope = { userId: "user-a", workspaceId: "workspace-a" };
function render(error: unknown, data: string[] | undefined = ["private request"]) {
	const query = { error, data, isFetching: false, dataUpdatedAt: 1, refetch: jest.fn() } as unknown as UseQueryResult<string[], unknown>;
	return renderToStaticMarkup(<PrivateUsageQuery query={query} scope={scope}>{(rows) => <p>{rows.join(",")}</p>}</PrivateUsageQuery>);
}

it.each([401, 403, 404])("hides previously loaded private content after an HTTP %s", (status) => {
	const html = render(new WebApiError("/api/account/settings/usage/logs", status));
	expect(html).not.toContain("private request");
	expect(html).toContain("Your session or workspace access changed");
});

it("keeps successful data visible through a transient refresh failure, with a warning", () => {
	const html = render(new Error("Network unavailable"));
	expect(html).toContain("private request");
	expect(html).toContain("Refresh failed");
});

it("renders cached content when no request is needed", () => {
	expect(render(null)).toContain("private request");
});
