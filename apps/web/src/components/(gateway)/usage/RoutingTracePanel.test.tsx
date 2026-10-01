import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoutingTracePanel } from "./RoutingTracePanel";

jest.mock("@/components/Logo", () => ({ Logo: () => null }));
jest.mock("@/components/ui/tooltip", () => ({
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

test("retains diagnostic values behind collapsed technical details", () => {
    const html = renderToStaticMarkup(<RoutingTracePanel decisions={[{
        provider_slug: "openai", decision: "ranked", selected: true, score: 0.812345,
        score_trace: {
            normalized: { priceScore: 0.8, reliabilitySample: 0.95, baseWeight: 1, rolloutMultiplier: 1 },
            inputs: { latencyMs: 123 },
            calculation: { formula: "balanced_weighted_additive", finalScore: 0.812345 },
        },
    }]} />);
    expect(html).toContain("Routing decision");
    expect(html).toContain("Score breakdown");
    expect(html).toContain("Price");
    expect(html).toContain("Reliability");
    expect(html).toContain('title="0.812345"');
    expect(html).toMatch(/<details(?![^>]*\bopen=)[^>]*><summary[^>]*>Technical details<\/summary>/);
    expect(html).toContain("balanced_weighted_additive");
    expect(html.indexOf("Technical details")).toBeLessThan(html.indexOf("Base Weight"));
    expect(html).toContain("Rollout Multiplier");
});

test("does not invent a selected provider for an incomplete decision record", () => {
    const html = renderToStaticMarkup(<RoutingTracePanel decisions={[{ provider_slug: "openai", decision: "ranked", score: 1 }]} />);
    expect(html).not.toContain("OpenAI selected");
});

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
