import { join } from "path";
import { DIR_MODELS, DIR_FAMILIES } from "../paths";
import { listDirs, readJson, readJsonWithHash, chunk, toInList } from "../util";
import { client, isDryRun, logWrite, assertOk, pruneRowsByColumn } from "../supa";
import { buildTimeline, type ModelRow, type ProviderEvent } from "../compute/timeline";
import { createHash } from "crypto";
import { ChangeTracker } from "../state";

function benchDigest(score: unknown, other_info?: string | null, source_link?: string | null, is_self_reported?: boolean) {
    const payload = JSON.stringify({
        score: String(score),
        other_info: other_info ?? "",
        source_link: source_link ?? "",
        is_self_reported: !!is_self_reported,
    });
    return createHash("md5").update(payload).digest("hex"); // use 'hex' as a valid BinaryToTextEncoding
}

type ModelJSON = {
    model_id: string;
    organisation_id: string;
    name: string;
    status?: string | null;
    previous_model_id?: string | null;
    announced_date?: string | null;
    release_date?: string | null;
    deprecation_date?: string | null;
    retirement_date?: string | null;
    license?: string | null;
    input_types?: string | null;
    output_types?: string | null;
    family_id?: string | null; // slug/key from families
    links?: Array<{ platform: string; url: string }>;
    details?: Array<{ name: string; value: unknown }>;
    benchmarks?: Array<{
        benchmark_id: string;
        score: unknown;
        is_self_reported: boolean;
        other_info?: string | null;
        source_link?: string | null;
        rank?: number | null;
    }>;
};

type FamilyJSON = {
    family_id: string;
    family_name?: string | null;
    organisation_id: string;
};

type ModelFileMeta = {
    model_id: string;
    organisation_id: string;
    previous_model_id: string | null;
};

export async function loadModels(
    tracker: ChangeTracker,
    { modelId }: { modelId: string | null }
) {
    const supa = client();
    if (!modelId) tracker.touchPrefix(DIR_MODELS);

    // ---------- 1) Read ALL JSON up front (no DB reads) ----------
    const famDirs = await listDirs(DIR_FAMILIES);
    const families: FamilyJSON[] = [];
    for (const d of famDirs) {
        const j = await readJson<any>(join(d, "family.json"));
        families.push({ family_id: j.family_id, organisation_id: j.organisation_id });
    }
    const familyExists = new Set(families.map(f => `${f.organisation_id}::${f.family_id}`));

    const orgDirs = await listDirs(DIR_MODELS);
    const modelRows: ModelRow[] = [];
    const modelIds = new Set<string>();
    const changedModels = new Set<string>();
    const timelineHints = new Set<string>();

    for (const orgPath of orgDirs) {
        const modelDirs = await listDirs(orgPath);
        for (const md of modelDirs) {
            const fp = join(md, "model.json");
            const { data: modelJson, hash } = await readJsonWithHash<ModelJSON>(fp);
            const row: ModelRow = {
                model_id: modelJson.model_id,
                name: modelJson.name,
                announcement_date: modelJson.announced_date ?? null,
                release_date: modelJson.release_date ?? null,
                deprecation_date: modelJson.deprecation_date ?? null,
                retirement_date: modelJson.retirement_date ?? null,
                previous_model_id: modelJson.previous_model_id ?? null,
            };
            modelRows.push(row);
            if (modelId && modelJson.model_id !== modelId) {
                continue;
            }
            const change = tracker.track(fp, hash, {
                model_id: modelJson.model_id,
                organisation_id: modelJson.organisation_id,
                previous_model_id: modelJson.previous_model_id ?? null,
            } as ModelFileMeta);

            modelIds.add(modelJson.model_id);

            if (change.status !== "unchanged") {
                changedModels.add(modelJson.model_id);
                const prevPrev = change.previous?.meta?.previous_model_id ?? null;
                const newPrev = modelJson.previous_model_id ?? null;
                if (newPrev) timelineHints.add(newPrev);
                if (prevPrev && prevPrev !== newPrev) timelineHints.add(prevPrev);
            }
        }
    }

    const deletedModels = modelId ? [] : tracker.getDeleted(DIR_MODELS);
    const deletedParents = new Set<string>();
    for (const d of deletedModels) {
        const meta = d.info.meta as ModelFileMeta | undefined;
        if (meta?.previous_model_id) deletedParents.add(meta.previous_model_id);
    }

    deletedParents.forEach(p => timelineHints.add(p));

    if (modelId && !modelRows.some(m => m.model_id === modelId)) {
        throw new Error(`Model '${modelId}' not found in ${DIR_MODELS}`);
    }

    const hasChanges = changedModels.size > 0 || deletedModels.length > 0;
    if (!hasChanges) return;

    // ---------- 2) Build lineage maps (JSON-only) ----------
    const byId = new Map<string, ModelRow>(modelRows.map(m => [m.model_id, m]));
    const children: Record<string, string[]> = {};
    for (const m of modelRows) {
        const p = m.previous_model_id || undefined;
        if (p) (children[p] ??= []).push(m.model_id);
    }

    const pastOf = (m: ModelRow): ModelRow[] => {
        const acc: ModelRow[] = [];
        const seen = new Set<string>();
        let cur = m.previous_model_id ? byId.get(m.previous_model_id) : undefined;
        while (cur && !seen.has(cur.model_id)) {
            seen.add(cur.model_id);
            acc.push(cur);
            cur = cur.previous_model_id ? byId.get(cur.previous_model_id) : undefined;
        }
        return acc;
    };

    const futureOf = (m: ModelRow): ModelRow[] => {
        const acc: ModelRow[] = [];
        const seen = new Set<string>();
        const q = [...(children[m.model_id] || [])];
        while (q.length) {
            const id = q.shift()!;
            if (seen.has(id)) continue;
            seen.add(id);
            const child = byId.get(id);
            if (!child) continue;
            acc.push(child);
            if (children[id]) q.push(...children[id]);
        }
        return acc;
    };

    // ---------- 3) UPSERT core models ----------
    const flushCoreRows = async (rows: Array<Record<string, any>>) => {
        if (!rows.length) return;
        if (isDryRun()) {
            for (const r of rows) logWrite("public.data_models", "UPSERT", r, { onConflict: "model_id" });
            return;
        }
        assertOk(
            await supa.from("data_models").upsert(rows, { onConflict: "model_id" }),
            "upsert data_models"
        );
    };

    const coreRows: Array<Record<string, any>> = [];

    // ---------- 4) UPSERT children + targeted prune (no reads) ----------
    for (const orgPath of orgDirs) {
        const modelDirs = await listDirs(orgPath);
        for (const md of modelDirs) {
            const fp = join(md, "model.json");
            const m = await readJson<ModelJSON>(fp);
            if (modelId && m.model_id !== modelId) continue;
            if (!changedModels.has(m.model_id)) continue;

            coreRows.push({
                name: m.name,
                organisation_id: m.organisation_id,
                status: m.status ?? null,
                announcement_date: m.announced_date ?? null,
                release_date: m.release_date ?? null,
                deprecation_date: m.deprecation_date ?? null,
                retirement_date: m.retirement_date ?? null,
                license: m.license ?? null,
                input_types: m.input_types ?? null,
                output_types: m.output_types ?? null,
                model_id: m.model_id,
                previous_model_id: m.previous_model_id && m.previous_model_id !== "-" ? m.previous_model_id : null,
                // only set family_id if that (org, family) exists in JSON families - otherwise NULL to satisfy FK
                family_id:
                    m.family_id && familyExists.has(`${m.organisation_id}::${m.family_id}`) ? m.family_id : null,
                timeline: {}, // to be filled below
            });

            if (coreRows.length >= 500) {
                await flushCoreRows(coreRows.splice(0, coreRows.length));
            }

        const model_id = m.model_id;

        // LINKS (dedupe by platform to avoid upsert conflicts)
        const rawLinkRows = (m.links ?? []).map(l => ({ model_id, platform: l.platform, url: l.url }));
        const linkMap = new Map<string, { model_id: string; platform: string; url: string }>();
        for (const r of rawLinkRows) {
            // keep the last occurrence for a given platform
            linkMap.set(r.platform, r);
        }
        const linkRows = Array.from(linkMap.values());

        if (isDryRun()) {
            for (const r of linkRows) logWrite("public.data_model_links", "UPSERT", r, { onConflict: "model_id,platform" });
            if (linkRows.length === 0) logWrite("public.data_model_links", "PRUNE", { model_id });
        } else {
            if (linkRows.length) {
                assertOk(
                    await supa.from("data_model_links").upsert(linkRows, { onConflict: "model_id,platform" }),
                    "upsert data_model_links"
                );
                const platforms = [...new Set(linkRows.map(l => l.platform))];
                assertOk(
                    await supa
                        .from("data_model_links")
                        .delete()
                        .eq("model_id", model_id)
                        .not("platform", "in", toInList(platforms)),
                    "prune data_model_links"
                );
            } else {
                // No links in source -> delete all existing for this model
                assertOk(await supa.from("data_model_links").delete().eq("model_id", model_id), "prune all links");
            }
        }

        // DETAILS
        const rawDetailRows = (m.details ?? []).map(d => ({
            model_id,
            detail_name: d.name,
            detail_value: String(d.value),
        }));
        const detailMap = new Map<string, { model_id: string; detail_name: string; detail_value: string }>();
        for (const r of rawDetailRows) {
            // keep last occurrence per detail_name
            detailMap.set(r.detail_name, r);
        }
        const detailRows = Array.from(detailMap.values());

        if (isDryRun()) {
            for (const r of detailRows) logWrite("public.data_model_details", "UPSERT", r, { onConflict: "model_id,detail_name" });
            if (detailRows.length === 0) logWrite("public.data_model_details", "PRUNE", { model_id });
        } else {
            if (detailRows.length) {
                assertOk(
                    await supa.from("data_model_details").upsert(detailRows, { onConflict: "model_id,detail_name" }),
                    "upsert data_model_details"
                );
                const names = [...new Set(detailRows.map(d => d.detail_name))];
                assertOk(
                    await supa
                        .from("data_model_details")
                        .delete()
                        .eq("model_id", model_id)
                        .not("detail_name", "in", toInList(names)),
                    "prune data_model_details"
                );
            } else {
                assertOk(await supa.from("data_model_details").delete().eq("model_id", model_id), "prune all details");
            }
        }

        // -------- BENCHMARKS (supports true duplicates safely) --------
        // Build rows with (benchmark_id + digest) buckets, assign occur_idx 1..n per identical digest.
        const rawBenches = m.benchmarks ?? [];

        // If you want visibility into duplicates that used to collide on your old key, keep this tiny logger:
        if (isDryRun() && rawBenches.length) {
            const seen = new Map<string, number>();
            const dupes: Array<{ key: string; first: number; second: number }> = [];
            rawBenches.forEach((b, i) => {
                const k = `${model_id}|${b.benchmark_id}|${String(b.score)}|${b.other_info ?? ""}`;
                if (seen.has(k)) dupes.push({ key: k, first: seen.get(k)!, second: i });
                else seen.set(k, i);
            });
            if (dupes.length) console.warn(`[bench dupe candidates on old key] model=${model_id}`, dupes.slice(0, 10));
        }

        // Build stable rows
        const perKeyCount = new Map<string, number>(); // key: benchmark_id|digest -> next occur_idx
        const benchRows = rawBenches.map(b => {
            const digest = benchDigest(b.score, b.other_info ?? null, b.source_link ?? null, b.is_self_reported);
            const bucket = `${b.benchmark_id}|${digest}`;
            const occur_idx = (perKeyCount.get(bucket) ?? 0) + 1;
            perKeyCount.set(bucket, occur_idx);

            const result_key = `${model_id}|${b.benchmark_id}|${digest}|${occur_idx}`;

            return {
                model_id,
                benchmark_id: b.benchmark_id,
                score: String(b.score),
                is_self_reported: !!b.is_self_reported,
                other_info: b.other_info ?? null,
                source_link: b.source_link ?? null,
                rank: b.rank ?? null,
                occur_idx,
                variant: null,       // keep null for now; add if you later encode run config
                result_key,
            };
        });

        if (isDryRun()) {
            for (const r of benchRows)
                logWrite("public.data_benchmark_results", "UPSERT", r, { onConflict: "result_key" });
        } else {
            // if (benchRows.length) {
            // UPSERT by unique result_key -- avoids "affect row a second time"
            assertOk(
                await supa.from("data_benchmark_results").upsert(benchRows, { onConflict: "result_key" }),
                "upsert data_benchmark_results"
            );

            // Precise prune: keep only this run's result_keys for this model
            const keep = benchRows.map(r => r.result_key);
            assertOk(
                await supa
                    .from("data_benchmark_results")
                    .delete()
                    .eq("model_id", model_id)
                    .not("result_key", "in", toInList(keep)),
                "prune data_benchmark_results"
            );
            // } else {
            //     // No benchmarks in source -> delete all for this model
            //     assertOk(await supa.from("data_benchmark_results").delete().eq("model_id", model_id), "prune all benchmarks");
            // }
        }
    }
    }

    await flushCoreRows(coreRows);

    // ---------- 5) Build timeline JSON with YOUR buildTimeline ----------
    // (Providers optional--left empty here; wire from JSON later if you want.)
    const timelineTargets = new Set<string>([
        ...changedModels,
        ...timelineHints,
    ]);

    const queue = [...timelineTargets];
    while (queue.length) {
        const id = queue.pop()!;
        const m = byId.get(id);
        if (!m) continue;

        const parent = m.previous_model_id ?? null;
        if (parent && !timelineTargets.has(parent)) {
            timelineTargets.add(parent);
            queue.push(parent);
        }
        const kids = children[id] ?? [];
        for (const kid of kids) {
            if (!timelineTargets.has(kid)) {
                timelineTargets.add(kid);
                queue.push(kid);
            }
        }
    }

    for (const id of timelineTargets) {
        const m = byId.get(id);
        if (!m) continue;
        const self = m;
        const past = pastOf(m);
        const future = futureOf(m);
        const providers: ProviderEvent[] = []; // supply if/when you add provider JSON

        const timeline = buildTimeline(self, past, future, providers);

        if (isDryRun()) {
            logWrite("public.data_models", "UPDATE", { model_id: m.model_id, timeline });
        } else {
            assertOk(
                await supa.from("data_models").update({ timeline }).eq("model_id", m.model_id),
                "update data_models.timeline"
            );
        }
    }

    if (!modelId) {
        await pruneRowsByColumn(supa, "data_model_links", "model_id", modelIds, "data_model_links");
        await pruneRowsByColumn(
            supa,
            "data_model_details",
            "model_id",
            modelIds,
            "data_model_details"
        );
        await pruneRowsByColumn(
            supa,
            "data_benchmark_results",
            "model_id",
            modelIds,
            "data_benchmark_results"
        );
        await pruneRowsByColumn(supa, "data_models", "model_id", modelIds, "data_models");
    }
}
