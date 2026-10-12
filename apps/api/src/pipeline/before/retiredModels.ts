import { getSupabaseAdmin } from "@/runtime/env";
import { tieredRead } from "@core/tiered-cache";

/**
 * Lifecycle lookup for requests that found no routable provider. Retirement
 * alone never stops routing: a retired model is served while any provider
 * route stays enabled. Only once no route remains does the gateway answer
 * 410 and name the suggested replacement.
 */
export type RetiredModelNotice = {
    model: string;
    retiredAt: string | null;
    replacementModel: string | null;
};

type ModelLifecycle = {
    status: string | null;
    retiredAt: string | null;
    replacementModel: string | null;
};

const LIFECYCLE_KEY_PREFIX = "gateway:model-lifecycle:v1:";
const MAX_MODEL_LENGTH = 512;

async function loadModelLifecycle(model: string): Promise<ModelLifecycle | null> {
    const { data, error } = await getSupabaseAdmin()
        .from("v2_models")
        .select("status,retired_at,replacement_model_slug")
        .eq("model_slug", model)
        .eq("hidden", false)
        .maybeSingle();
    if (error) throw new Error("gateway_model_lifecycle_failed");
    if (!data) return null;
    return {
        status: typeof data.status === "string" ? data.status : null,
        retiredAt: typeof data.retired_at === "string" ? data.retired_at : null,
        replacementModel: typeof data.replacement_model_slug === "string" ? data.replacement_model_slug : null,
    };
}

function isLifecycle(value: unknown): value is ModelLifecycle {
    if (!value || typeof value !== "object") return false;
    const row = value as Record<string, unknown>;
    return ["status", "retiredAt", "replacementModel"].every(
        (key) => row[key] === null || typeof row[key] === "string",
    );
}

export function retiredModelNotice(
    model: string,
    lifecycle: ModelLifecycle | null,
    now = Date.now(),
): RetiredModelNotice | null {
    if (!lifecycle) return null;
    const retiredAtMs = lifecycle.retiredAt ? Date.parse(lifecycle.retiredAt) : Number.NaN;
    const retired = lifecycle.status?.trim().toLowerCase() === "retired" ||
        (Number.isFinite(retiredAtMs) && retiredAtMs <= now);
    if (!retired) return null;
    return { model, retiredAt: lifecycle.retiredAt, replacementModel: lifecycle.replacementModel };
}

/** The retirement notice for `model`, or `null` when it is unknown, hidden or not retired. */
export async function findRetiredModelNotice(model: string): Promise<RetiredModelNotice | null> {
    const slug = model.trim();
    if (!slug || slug.length > MAX_MODEL_LENGTH || slug.startsWith("@")) return null;
    try {
        const lifecycle = await tieredRead<ModelLifecycle>({
            key: `${LIFECYCLE_KEY_PREFIX}${slug}`,
            loader: () => loadModelLifecycle(slug),
            l1FreshMs: 60_000,
            l2: { freshS: 300, storeS: 3_600 },
            l3: false,
            validate: isLifecycle,
            // Unknown names can be workspace-private model identifiers; keep
            // "not found" out of the shared layer.
            isShareable: (value) => value !== null,
        });
        return retiredModelNotice(slug, lifecycle);
    } catch {
        // The caller already has a complete error to return without this detail.
        return null;
    }
}

export function describeRetiredModel(notice: RetiredModelNotice): string {
    const date = notice.retiredAt ? notice.retiredAt.slice(0, 10) : null;
    const retired = date
        ? `Model "${notice.model}" was retired on ${date} and no provider serves it any more.`
        : `Model "${notice.model}" is retired and no provider serves it any more.`;
    return notice.replacementModel ? `${retired} Use "${notice.replacementModel}" instead.` : retired;
}
