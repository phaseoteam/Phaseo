import type { RequestLabel } from "@core/types";

export const REQUEST_LABELS_HEADER = "x-phaseo-metadata";
/** Set only by the gateway on its own request classifier calls; counted as classifier spend. */
export const RESERVED_CLASSIFIER_LABEL_KEY = "phaseo.classifier";

const MAX_HEADER_LENGTH = 8_192;
const MAX_LABELS = 32;
const MAX_KEY_LENGTH = 64;
const MAX_VALUE_LENGTH = 256;
const LABEL_KEY_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export type RequestLabelsResult =
    | { ok: true; labels: RequestLabel[] }
    | { ok: false; message: string };

function normalizeLabel(value: unknown, field: "key" | "value"): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    const maxLength = field === "key" ? MAX_KEY_LENGTH : MAX_VALUE_LENGTH;
    if (!normalized || normalized.length > maxLength) return null;
    if (field === "key" && !LABEL_KEY_PATTERN.test(normalized)) return null;
    if (CONTROL_CHARACTER_PATTERN.test(normalized)) return null;
    return normalized;
}
export function parseRequestLabels(req: Request, options: { allowClassifierLabel?: boolean } = {}): RequestLabelsResult {
    const raw = req.headers.get(REQUEST_LABELS_HEADER);
    if (!raw) return { ok: true, labels: [] };
    if (raw.length > MAX_HEADER_LENGTH) {
        return { ok: false, message: `${REQUEST_LABELS_HEADER} exceeds ${MAX_HEADER_LENGTH} characters` };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ok: false, message: `${REQUEST_LABELS_HEADER} must contain valid JSON` };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, message: `${REQUEST_LABELS_HEADER} must be a JSON object` };
    }
    const rawLabels = (parsed as Record<string, unknown>).labels;
    if (!Array.isArray(rawLabels) || rawLabels.length > MAX_LABELS) {
        return { ok: false, message: `${REQUEST_LABELS_HEADER}.labels must be an array of at most ${MAX_LABELS} items` };
    }

    const labels: RequestLabel[] = [];
    const keys = new Set<string>();
    for (const [index, rawLabel] of rawLabels.entries()) {
        if (!rawLabel || typeof rawLabel !== "object" || Array.isArray(rawLabel)) {
            return { ok: false, message: `${REQUEST_LABELS_HEADER}.labels[${index}] must be an object` };
        }
        const label = rawLabel as Record<string, unknown>;
        const key = normalizeLabel(label.key, "key");
        const value = normalizeLabel(label.value, "value");
        if (!key || !value) {
            return { ok: false, message: `${REQUEST_LABELS_HEADER}.labels[${index}] must contain a valid key and value` };
        }
        if (key === RESERVED_CLASSIFIER_LABEL_KEY && !options.allowClassifierLabel) {
            return { ok: false, message: `${REQUEST_LABELS_HEADER} label key ${RESERVED_CLASSIFIER_LABEL_KEY} is reserved` };
        }
        if (keys.has(key)) {
            return { ok: false, message: `${REQUEST_LABELS_HEADER} cannot contain duplicate keys` };
        }
        keys.add(key);
        labels.push({ key, value });
    }
    return { ok: true, labels };
}
