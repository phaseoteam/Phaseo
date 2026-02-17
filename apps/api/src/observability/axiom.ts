// Purpose: Observability utilities for logging and analytics.
// Why: Keeps telemetry non-blocking and centralized.
// How: Sends structured events to Axiom with safe timeouts.

import { getBindings } from "@/runtime/env";

export type WideEvent = Record<string, unknown>;
let warnedMissingWideDataset = false;
let warnedSharedDataset = false;

export async function sendAxiomWideEvent(event: WideEvent) {
    const bindings = getBindings();
    const dataset = bindings.AXIOM_WIDE_DATASET;
    const token = bindings.AXIOM_API_KEY;

    if (!dataset || !token) {
        if (!dataset && !warnedMissingWideDataset) {
            warnedMissingWideDataset = true;
            console.warn("[observability] AXIOM_WIDE_DATASET not set; skipping wide event ingestion.");
        }
        return;
    }
    if (bindings.AXIOM_DATASET && dataset === bindings.AXIOM_DATASET) {
        if (!warnedSharedDataset) {
            warnedSharedDataset = true;
            console.warn("[observability] AXIOM_WIDE_DATASET matches AXIOM_DATASET; skipping wide event ingestion to avoid duplicates.");
        }
        return;
    }

    const payload = JSON.stringify([event]);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        const res = await fetch(`https://api.axiom.co/v1/datasets/${encodeURIComponent(dataset)}/ingest`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: payload,
            cache: "no-store",
            signal: controller.signal,
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            console.error("[observability] Axiom wide event ingest failed", {
                status: res.status,
                response: body.slice(0, 300),
            });
        }
    } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            console.error("[observability] Axiom wide event timeout");
            return;
        }
        console.error("[observability] Axiom wide event error", err);
    } finally {
        clearTimeout(timeoutId);
    }
}

