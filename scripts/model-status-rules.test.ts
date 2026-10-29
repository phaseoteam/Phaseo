import assert from "node:assert/strict";
import test from "node:test";

import { deriveStatusFromDates, pickStatus } from "./model-status-rules.ts";

test("keeps a model deprecated while an active gateway route exists", () => {
    const status = deriveStatusFromDates(
        {
            deprecation_date: "2026-07-01T00:00:00",
            retirement_date: "2026-07-31T00:00:00",
        },
        new Date("2026-08-05T00:00:00"),
        true
    );

    assert.deepEqual(status, {
        status: "Deprecated",
        reason: "deprecation_date 2026-07-01T00:00:00",
    });
});

test("retires a model after its retirement date when no active gateway route exists", () => {
    const status = deriveStatusFromDates(
        { retirement_date: "2026-07-31T00:00:00" },
        new Date("2026-08-05T00:00:00")
    );

    assert.equal(status?.status, "Retired");
});

test("does not promote a rumoured model without manual announcement verification", () => {
    const derived = deriveStatusFromDates(
        { announced_date: "2026-08-01T00:00:00" },
        new Date("2026-08-05T00:00:00")
    );

    assert.equal(pickStatus("Rumoured", derived), "Rumoured");
});
