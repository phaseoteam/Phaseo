import { describe, expect, it } from "vitest";
import { parseRequestLabels } from "./request-labels";

describe("parseRequestLabels", () => {
    it("reserves the classifier label for the gateway's own classifier calls", () => {
        const request = () => new Request("https://gateway.local", {
            headers: { "x-phaseo-metadata": JSON.stringify({ labels: [{ key: "phaseo.classifier", value: "clf_1" }] }) },
        });
        expect(parseRequestLabels(request())).toEqual({ ok: false, message: "x-phaseo-metadata label key phaseo.classifier is reserved" });
        expect(parseRequestLabels(request(), { allowClassifierLabel: true })).toEqual({ ok: true, labels: [{ key: "phaseo.classifier", value: "clf_1" }] });
    });

    it("parses unique string labels from the Phaseo header", () => {
        const result = parseRequestLabels(new Request("https://gateway.local", {
            headers: {
                "x-phaseo-metadata": JSON.stringify({
                    labels: [
                        { key: "team", value: "support" },
                        { key: "environment", value: "production" },
                    ],
                }),
            },
        }));

        expect(result).toEqual({
            ok: true,
            labels: [
                { key: "team", value: "support" },
                { key: "environment", value: "production" },
            ],
        });
    });

    it("does not read unrelated metadata headers and rejects duplicate keys", () => {
        expect(parseRequestLabels(new Request("https://gateway.local", {
            headers: { "x-unrecognized-metadata": '{"labels":[{"key":"team","value":"support"}]}' },
        }))).toEqual({ ok: true, labels: [] });

        const result = parseRequestLabels(new Request("https://gateway.local", {
            headers: { "x-phaseo-metadata": '{"labels":[{"key":"team","value":"support"},{"key":"team","value":"sales"}]}' },
        }));
        expect(result).toMatchObject({ ok: false, message: expect.stringContaining("duplicate") });
    });

    it("rejects malformed metadata and invalid key characters", () => {
        expect(parseRequestLabels(new Request("https://gateway.local", {
            headers: { "x-phaseo-metadata": "not-json" },
        }))).toMatchObject({ ok: false, message: expect.stringContaining("valid JSON") });

        expect(parseRequestLabels(new Request("https://gateway.local", {
            headers: { "x-phaseo-metadata": '{"labels":[{"key":"team/name","value":"support"}]}' },
        })).ok).toBe(false);
    });

    it.each(["hidden\u0000request", "line\nbreak", "tab\tvalue", "delete\u007fvalue"])(
        "rejects control characters before labels reach JSONB audit storage: %j",
        (value) => {
            const result = parseRequestLabels(new Request("https://gateway.local", {
                headers: { "x-phaseo-metadata": JSON.stringify({ labels: [{ key: "team", value }] }) },
            }));

            expect(result.ok).toBe(false);
        },
    );
});
