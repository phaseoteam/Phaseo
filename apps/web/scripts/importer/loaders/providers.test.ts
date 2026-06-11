import { squashCapabilityParams } from "./providers";

jest.mock("../paths", () => ({
    DIR_ORGS: "orgs",
    DIR_PROVIDERS: "providers",
}));

jest.mock("../supa", () => ({
    client: jest.fn(),
    isDryRun: jest.fn(() => false),
    logWrite: jest.fn(),
    assertOk: jest.fn(),
    pruneRowsByColumn: jest.fn(),
    touchModelTimestamps: jest.fn(),
}));

describe("squashCapabilityParams", () => {
    it("converts legacy string arrays into empty metadata objects", () => {
        expect(squashCapabilityParams(["temperature", " top_p ", "", 123])).toEqual({
            temperature: {},
            top_p: {},
        });
    });

    it("preserves legacy provider bounds from object arrays", () => {
        expect(
            squashCapabilityParams([
                {
                    param_id: "temperature",
                    provider_min: 0,
                    provider_max: 2,
                    provider_default: 1,
                    notes: "Provider clamps values outside the documented range.",
                },
            ])
        ).toEqual({
            temperature: {
                provider_min: 0,
                provider_max: 2,
                provider_default: 1,
                notes: "Provider clamps values outside the documented range.",
            },
        });
    });

    it("preserves structured supported parameter metadata from object arrays", () => {
        expect(
            squashCapabilityParams([
                {
                    param_id: "resolution",
                    type: "enum",
                    values: ["720p", "1080p"],
                    default: "720p",
                    provider_default: "1080p",
                    notes: null,
                },
                {
                    param_id: "duration",
                    type: "integer",
                    min: 1,
                    max: 10,
                    step: 1,
                },
            ])
        ).toEqual({
            resolution: {
                type: "enum",
                values: ["720p", "1080p"],
                default: "720p",
                provider_default: "1080p",
            },
            duration: {
                type: "integer",
                min: 1,
                max: 10,
                step: 1,
            },
        });
    });

    it("keeps already-keyed structured parameter objects intact", () => {
        expect(
            squashCapabilityParams({
                voice: {
                    type: "enum",
                    values: ["alloy", "verse"],
                    default: "alloy",
                    notes: null,
                },
            })
        ).toEqual({
            voice: {
                type: "enum",
                values: ["alloy", "verse"],
                default: "alloy",
            },
        });
    });
});
