import { describe, expect, it } from "vitest";
import { json } from "./utils";

describe("route JSON serialization", () => {
    it("removes exception and stack details recursively", async () => {
        const response = json({
            failure: new Error("database password leaked"),
            nested: {
                stack: "secret stack",
                stack_trace: "secret trace",
                safe: "visible",
            },
        }, 500);

        const serialized = await response.text();
        expect(JSON.parse(serialized)).toEqual({
            failure: { error: "internal_error" },
            nested: { safe: "visible" },
        });
        expect(serialized).not.toContain("database password leaked");
    });
});
