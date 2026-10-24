import { dispatchBackground, getBindingsIfConfigured, getSupabaseAdmin } from "@/runtime/env";
import { tieredRead } from "@core/tiered-cache";

/**
 * Successor routing for models no provider serves any more. A request is only
 * redirected when every one of these holds:
 * - the model has had no routable route for the grace period (72h, tracked in
 *   `v2_model_successor_routing.unserved_since`);
 * - an admin approved each hop to the current replacement model;
 * - the target is not a paid model replacing a free one;
 * - the workspace turned redirects on and the price policy allows the target.
 * A workspace may also name its own replacement for a model, or block the
 * redirect for it. Its own replacement needs no admin approval and ignores the
 * price policy, but keeps the grace period and the free-to-paid block.
 * Model and key restrictions are enforced on the target afterwards, as for any
 * other model; they are never widened.
 */
export type ModelSuccessorResolution = {
    model: string;
    replacementModel: string | null;
    unservedSince: string | null;
    target: string | null;
    chain: string[];
    reason: string | null;
    priceRatio: number | null;
    priceComparable: boolean;
    /**
     * Meters only the successor bills that the price comparison left out
     * because the retired model could not have incurred them (web tools, or a
     * modality it never had). They only hold for a request that uses none of them.
     */
    priceSkippedMeters: string[];
    workspaceOverride: boolean;
};

export type SuccessorPricePolicy = "never" | "limit" | "any";

export type SuccessorRedirectPolicy = {
    enabled: boolean;
    pricePolicy: SuccessorPricePolicy;
    maxPriceIncreasePercent: number;
    /** Model slug to the workspace's own replacement, or `null` to never redirect it. */
    overrides: Record<string, string | null>;
};

export type ModelSubstitution = {
    from: string;
    to: string;
    reason: "unserved";
    chain: string[];
    unservedSince: string | null;
    priceRatio: number | null;
    source: "approved" | "workspace";
};

// v2: resolutions carry priceSkippedMeters, which v1 entries could have dropped.
const RESOLUTION_KEY_PREFIX = "gateway:model-successor:v2:";
const WORKSPACE_RESOLUTION_KEY_PREFIX = "gateway:model-successor-workspace:v2:";
const POLICY_KEY_PREFIX = "gateway:model-successor-policy:v2:";
const MAX_MODEL_LENGTH = 512;
const MAX_WORKSPACE_OVERRIDES = 500;
const DISABLED_POLICY: SuccessorRedirectPolicy = { enabled: false, pricePolicy: "never", maxPriceIncreasePercent: 0, overrides: {} };

export function successorRedirectEnabled(): boolean {
    return getBindingsIfConfigured()?.GATEWAY_MODEL_SUCCESSOR_REDIRECT_ENABLED !== "false";
}

function stringOrNull(value: unknown): string | null {
    return typeof value === "string" && value ? value : null;
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function finiteOrNull(value: unknown): number | null {
    const number = typeof value === "string" ? Number(value) : value;
    return typeof number === "number" && Number.isFinite(number) ? number : null;
}

export function parseModelSuccessorResolution(value: unknown): ModelSuccessorResolution | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    const model = stringOrNull(row.model);
    if (!model) return null;
    return {
        model,
        replacementModel: stringOrNull(row.replacement_model ?? row.replacementModel),
        unservedSince: stringOrNull(row.unserved_since ?? row.unservedSince),
        target: stringOrNull(row.target),
        chain: Array.isArray(row.chain) ? row.chain.filter((item): item is string => typeof item === "string") : [],
        reason: stringOrNull(row.reason),
        priceRatio: finiteOrNull(row.price_ratio ?? row.priceRatio),
        priceComparable: (row.price_comparable ?? row.priceComparable) === true,
        priceSkippedMeters: stringArray(row.price_skipped_meters ?? row.priceSkippedMeters),
        workspaceOverride: (row.workspace_override ?? row.workspaceOverride) === true,
    };
}

function isResolution(value: unknown): value is ModelSuccessorResolution {
    if (!value || typeof value !== "object") return false;
    const row = value as Record<string, unknown>;
    return typeof row.model === "string" && Array.isArray(row.chain) && typeof row.priceComparable === "boolean" &&
        Array.isArray(row.priceSkippedMeters) && typeof row.workspaceOverride === "boolean";
}

async function loadResolution(model: string): Promise<ModelSuccessorResolution | null> {
    const { data, error } = await getSupabaseAdmin().rpc("gateway_resolve_model_successor", { p_model_slug: model });
    if (error) throw new Error("gateway_model_successor_failed");
    return parseModelSuccessorResolution(data);
}

/** Successor routing state for a model with no providers, or `null` when unknown or unavailable. */
export async function findModelSuccessor(model: string): Promise<ModelSuccessorResolution | null> {
    const slug = model.trim();
    if (!slug || slug.length > MAX_MODEL_LENGTH || slug.startsWith("@")) return null;
    try {
        return await tieredRead<ModelSuccessorResolution>({
            key: `${RESOLUTION_KEY_PREFIX}${slug}`,
            loader: () => loadResolution(slug),
            l1FreshMs: 60_000,
            l2: { freshS: 300, storeS: 3_600 },
            l3: false,
            validate: isResolution,
            // Unknown names can be workspace-private model identifiers.
            isShareable: (value) => value !== null,
        });
    } catch {
        return null;
    }
}

async function loadWorkspaceResolution(model: string, successor: string): Promise<ModelSuccessorResolution | null> {
    const { data, error } = await getSupabaseAdmin().rpc("gateway_resolve_workspace_model_successor", {
        p_model_slug: model,
        p_successor_slug: successor,
    });
    if (error) throw new Error("gateway_workspace_model_successor_failed");
    return parseModelSuccessorResolution(data);
}

/** Resolution for a workspace's own replacement of `model`. Shared: it holds only public catalogue state. */
export async function findWorkspaceModelSuccessor(model: string, successor: string): Promise<ModelSuccessorResolution | null> {
    const slug = model.trim();
    const target = successor.trim();
    if (!slug || !target || slug.length > MAX_MODEL_LENGTH || target.length > MAX_MODEL_LENGTH || slug.startsWith("@")) return null;
    try {
        return await tieredRead<ModelSuccessorResolution>({
            key: `${WORKSPACE_RESOLUTION_KEY_PREFIX}${slug}|${target}`,
            loader: () => loadWorkspaceResolution(slug, target),
            l1FreshMs: 60_000,
            l2: { freshS: 300, storeS: 3_600 },
            l3: false,
            validate: isResolution,
            isShareable: (value) => value !== null,
        });
    } catch {
        return null;
    }
}

/**
 * The workspace's own choice for `model`: `undefined` when it has none, `null`
 * when it never redirects the model, otherwise the replacement slug.
 */
export function workspaceSuccessorOverride(policy: SuccessorRedirectPolicy, model: string): string | null | undefined {
    return Object.hasOwn(policy.overrides, model) ? policy.overrides[model] : undefined;
}

export function parseSuccessorRedirectPolicy(row: unknown, overrideRows: unknown = []): SuccessorRedirectPolicy {
    if (!row || typeof row !== "object") return DISABLED_POLICY;
    const record = row as Record<string, unknown>;
    const pricePolicy = record.model_successor_price_policy;
    const percent = finiteOrNull(record.model_successor_max_price_increase_percent);
    return {
        enabled: record.model_successor_redirect_enabled === true,
        pricePolicy: pricePolicy === "limit" || pricePolicy === "any" ? pricePolicy : "never",
        maxPriceIncreasePercent: percent !== null && percent > 0 ? percent : 0,
        overrides: parseOverrides(overrideRows),
    };
}

function parseOverrides(rows: unknown): Record<string, string | null> {
    const overrides: Record<string, string | null> = {};
    if (!Array.isArray(rows)) return overrides;
    for (const row of rows) {
        const model = stringOrNull((row as Record<string, unknown> | null)?.model_slug);
        if (!model) continue;
        overrides[model] = stringOrNull((row as Record<string, unknown>).successor_model_slug);
    }
    return overrides;
}

function isPolicy(value: unknown): value is SuccessorRedirectPolicy {
    if (!value || typeof value !== "object") return false;
    const policy = value as Record<string, unknown>;
    return typeof policy.enabled === "boolean" &&
        ["never", "limit", "any"].includes(String(policy.pricePolicy)) &&
        typeof policy.maxPriceIncreasePercent === "number" &&
        !!policy.overrides && typeof policy.overrides === "object" && !Array.isArray(policy.overrides);
}

async function loadPolicy(workspaceId: string): Promise<SuccessorRedirectPolicy> {
    const client = getSupabaseAdmin();
    const [settings, overrides] = await Promise.all([
        client
            .from("workspace_settings")
            .select("model_successor_redirect_enabled,model_successor_price_policy,model_successor_max_price_increase_percent")
            .eq("workspace_id", workspaceId)
            .maybeSingle(),
        client
            .from("workspace_model_successor_overrides")
            .select("model_slug,successor_model_slug")
            .eq("workspace_id", workspaceId)
            .limit(MAX_WORKSPACE_OVERRIDES),
    ]);
    if (settings.error || overrides.error) throw new Error("gateway_model_successor_policy_failed");
    return parseSuccessorRedirectPolicy(settings.data, overrides.data ?? []);
}

/** The workspace's successor redirect settings; off when unset or unreadable. */
export async function loadSuccessorRedirectPolicy(workspaceId: string): Promise<SuccessorRedirectPolicy> {
    try {
        return await tieredRead<SuccessorRedirectPolicy>({
            key: `${POLICY_KEY_PREFIX}${workspaceId}`,
            loader: () => loadPolicy(workspaceId),
            l1FreshMs: 30_000,
            l2: { freshS: 60, storeS: 300 },
            l3: false,
            validate: isPolicy,
        }) ?? DISABLED_POLICY;
    } catch {
        return DISABLED_POLICY;
    }
}

type Modality = "text" | "image" | "audio" | "video";
const MODALITIES: Modality[] = ["text", "image", "audio", "video"];
const MAX_SCANNED_NODES = 20_000;
const CLIENT_TOOL_TYPES = new Set(["function", "custom"]);
const WEB_TOOL_PATTERN = /web_?search|web_?fetch|google_?search/i;

type RequestUsage = { webTools: boolean; input: Set<Modality>; output: Set<Modality> };

/** Media modalities a content type, key or MIME type names. Files and documents can hold any of them. */
function mediaModalitiesOf(text: string): Modality[] {
    const lower = text.toLowerCase();
    const found = MODALITIES.filter((modality) => modality !== "text" && lower.includes(modality));
    if (found.length || !/file|document|blob|media/.test(lower)) return found;
    return ["image", "audio", "video"];
}

function isClientTool(tool: unknown): boolean {
    if (!tool || typeof tool !== "object") return false;
    const entry = tool as Record<string, unknown>;
    if (WEB_TOOL_PATTERN.test(JSON.stringify(entry))) return false;
    if (typeof entry.type === "string") return CLIENT_TOOL_TYPES.has(entry.type);
    // Anthropic client tools have no type; Gemini groups functions in functionDeclarations.
    return "input_schema" in entry || "function_declarations" in entry || "functionDeclarations" in entry;
}

/**
 * What a raw request body of any surface may use that a successor could bill.
 * It errs towards using more: a wrong guess only keeps the original failure.
 */
function scanRequestUsage(body: unknown): RequestUsage {
    const usage: RequestUsage = { webTools: false, input: new Set(), output: new Set() };
    if (!body || typeof body !== "object") return usage;
    const request = body as Record<string, any>;
    const tools: unknown[] = Array.isArray(request.tools) ? request.tools : [];
    usage.webTools = tools.some((tool) => !isClientTool(tool)) ||
        request.web_search_options != null || (Array.isArray(request.plugins) && request.plugins.length > 0);
    if (tools.some((tool) => !isClientTool(tool) && /image_generation/i.test(JSON.stringify(tool)))) usage.output.add("image");

    let scanned = 0;
    const addMedia = (text: string) => {
        for (const modality of mediaModalitiesOf(text)) usage.input.add(modality);
    };
    const visit = (node: unknown): void => {
        if (++scanned > MAX_SCANNED_NODES) return;
        if (typeof node === "string") {
            usage.input.add("text");
            return;
        }
        if (Array.isArray(node)) {
            for (const item of node) visit(item);
            return;
        }
        if (!node || typeof node !== "object") return;
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
            if (typeof value === "string" && (key === "type" || key === "mime_type" || key === "mimeType" || key === "media_type")) {
                addMedia(key === "type" ? value : value.split("/")[0] ?? "");
                continue;
            }
            addMedia(key);
            visit(value);
        }
    };
    for (const key of ["messages", "input", "contents", "system", "systemInstruction", "system_instruction", "prompt"]) {
        if (key in request) visit(request[key]);
    }
    // Too large to read in full: assume it may hold anything.
    if (scanned > MAX_SCANNED_NODES) for (const modality of MODALITIES) usage.input.add(modality);

    const requestedOutput = [request.modalities, request.response_modalities, request.generationConfig?.responseModalities,
        request.generation_config?.response_modalities].flatMap((value) => (Array.isArray(value) ? value : []));
    for (const value of requestedOutput) {
        const modality = String(value).toLowerCase() as Modality;
        if (MODALITIES.includes(modality)) usage.output.add(modality);
    }
    if (request.audio != null) usage.output.add("audio");
    return usage;
}

/**
 * Whether the request could incur a meter the price comparison skipped, so
 * the comparison does not hold for it. Unknown meters always could.
 */
export function requestMayIncurSkippedMeters(body: unknown, meters: readonly string[]): boolean {
    if (!meters.length) return false;
    const usage = scanRequestUsage(body);
    return meters.some((meter) => {
        if (meter === "native_web_search_requests" || meter === "native_web_fetch_requests") return usage.webTools;
        const match = /^(input|output)_(image|audio|video)_/.exec(meter);
        if (!match) return true;
        return (match[1] === "input" ? usage.input : usage.output).has(match[2] as Modality);
    });
}

/**
 * Whether the workspace's price policy allows the target. An unknown price
 * ratio is only allowed by "any", and so is one that leaves out a charge the
 * request could incur. The workspace's own replacement is always allowed.
 */
export function successorPriceAllowed(
    resolution: ModelSuccessorResolution,
    policy: SuccessorRedirectPolicy,
    requestBody?: unknown,
): boolean {
    if (policy.pricePolicy === "any" || resolution.workspaceOverride) return true;
    if (!resolution.priceComparable || resolution.priceRatio === null) return false;
    if (requestMayIncurSkippedMeters(requestBody, resolution.priceSkippedMeters ?? [])) return false;
    const limit = policy.pricePolicy === "limit" ? 1 + policy.maxPriceIncreasePercent / 100 : 1;
    // Ratios are rounded to 6 places in SQL; tolerate that rounding at the limit.
    return resolution.priceRatio <= limit + 1e-6;
}

/** The substitution to apply, or `null` when the request must fail as it would today. */
export function successorRedirectTarget(
    resolution: ModelSuccessorResolution | null,
    policy: SuccessorRedirectPolicy,
    requestBody?: unknown,
): ModelSubstitution | null {
    if (!resolution?.target || resolution.reason !== "eligible") return null;
    if (!policy.enabled || !successorPriceAllowed(resolution, policy, requestBody)) return null;
    return {
        from: resolution.model,
        to: resolution.target,
        reason: "unserved",
        chain: resolution.chain.length ? resolution.chain : [resolution.target],
        unservedSince: resolution.unservedSince,
        priceRatio: resolution.priceRatio,
        source: resolution.workspaceOverride ? "workspace" : "approved",
    };
}

/** `X-Phaseo-Model-Substitution` value, for example `reason=unserved; from=a/old; to=a/new`. */
export function modelSubstitutionHeader(substitution: ModelSubstitution): string {
    return `reason=${substitution.reason}; from=${substitution.from}; to=${substitution.to}`;
}

const MAX_RECORDED_SUBSTITUTIONS = 1_000;
const recordedSubstitutions = new Set<string>();

/**
 * Queues the one-off "now served by" notice for the workspace. The database
 * keeps one notice per workspace, model and replacement; this isolate also
 * remembers what it already sent so a busy redirect is one call, not one per
 * request.
 */
export function recordModelSubstitution(workspaceId: string | null | undefined, substitution: ModelSubstitution): Promise<void> | null {
    if (!workspaceId) return null;
    // Slugs may contain ":", so the parts are encoded rather than joined.
    const key = JSON.stringify([workspaceId, substitution.from, substitution.to]);
    if (recordedSubstitutions.has(key)) return null;
    if (recordedSubstitutions.size >= MAX_RECORDED_SUBSTITUTIONS) recordedSubstitutions.clear();
    recordedSubstitutions.add(key);
    return (async () => {
        const { error } = await getSupabaseAdmin().rpc("record_model_substitution", {
            p_workspace_id: workspaceId,
            p_model_slug: substitution.from,
            p_successor_slug: substitution.to,
            p_source: substitution.source,
        });
        if (error) {
            recordedSubstitutions.delete(key);
            throw new Error(`model_substitution_record_failed:${error.message}`);
        }
    })();
}

/**
 * Queues the notice once a request a successor served has completed
 * successfully: for streams, only after the whole stream was delivered.
 */
export function noteModelSubstitutionServed(ctx: {
    routingDiagnostics?: Record<string, any> | null;
    workspaceId?: string | null;
    testingMode?: boolean;
}): void {
    const substitution = ctx.routingDiagnostics?.modelSubstitution as ModelSubstitution | undefined;
    if (!substitution || ctx.testingMode) return;
    const recording = recordModelSubstitution(ctx.workspaceId, substitution);
    if (recording) dispatchBackground(recording);
}

/** Test hook: forget which substitutions this isolate has recorded. */
export function resetRecordedModelSubstitutions(): void {
    recordedSubstitutions.clear();
}
