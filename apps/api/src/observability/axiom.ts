// Purpose: Observability utilities for logging and analytics.
// Why: Keeps telemetry non-blocking and centralized.
// How: Sends structured events to Axiom with safe timeouts.

import { getBindings } from "@/runtime/env";

export type WideEvent = Record<string, unknown>;
let warnedMissingWideDataset = false;
let lastAxiomTransportErrorAt = 0;
let suppressedAxiomTransportErrors = 0;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function logAxiomTransportError(message: string, payload?: Record<string, unknown>) {
    const bindings = getBindings();
    const cooldownMs = parsePositiveInteger(bindings.AXIOM_LOG_FAILURE_COOLDOWN_MS, 60_000);
    const now = Date.now();
    if (now - lastAxiomTransportErrorAt < cooldownMs) {
        suppressedAxiomTransportErrors += 1;
        return;
    }

    const suppressed = suppressedAxiomTransportErrors;
    suppressedAxiomTransportErrors = 0;
    lastAxiomTransportErrorAt = now;
    console.error(message, {
        ...(payload ?? {}),
        ...(suppressed > 0 ? { suppressed_count: suppressed } : {}),
    });
}

export async function sendAxiomWideEvent(event: WideEvent) {
    const bindings = getBindings();
    const dataset = bindings.AXIOM_DATASET ?? bindings.AXIOM_WIDE_DATASET;
    const token = bindings.AXIOM_API_KEY;

    if (!dataset || !token) {
        if (!dataset && !warnedMissingWideDataset) {
            warnedMissingWideDataset = true;
            console.warn("[observability] AXIOM_DATASET not set; skipping wide event ingestion.");
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
            logAxiomTransportError("[observability] Axiom wide event ingest failed", {
                status: res.status,
                response: body.slice(0, 300),
            });
        }
    } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            logAxiomTransportError("[observability] Axiom wide event timeout");
            return;
        }
        logAxiomTransportError("[observability] Axiom wide event error", {
            error: err instanceof Error ? err.message : String(err),
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

