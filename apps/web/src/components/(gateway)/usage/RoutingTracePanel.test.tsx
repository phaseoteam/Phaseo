import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoutingTracePanel } from "./RoutingTracePanel";

jest.mock("@/components/Logo", () => ({ Logo: () => null }));
jest.mock("@/components/ui/tooltip", () => ({
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

test.each([undefined, new Map([["openai", "OpenAI"], ["openai-eu", "OpenAI"]])])(
    "distinguishes the selected global route from an excluded EU route",
    (providerNames) => {
        const html = renderToStaticMarkup(<RoutingTracePanel
            providerNames={providerNames}
            decisions={[
                { provider_slug: "openai", decision: "ranked", selected: true, score: 1 },
                { provider_slug: "openai-eu", decision: "excluded", exclusion_reason: "region" },
            ]}
        />);
        expect(html).toContain("OpenAI selected from 1 scored candidate");
        expect(html).toContain("OpenAI (EU)");
    },
);
