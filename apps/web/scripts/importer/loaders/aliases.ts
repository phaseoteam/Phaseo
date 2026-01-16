import { join } from "path";
import { DIR_ALIASES } from "../paths";
import { listDirs, readJsonWithHash } from "../util";
import { client, isDryRun, logWrite, assertOk, pruneRowsByColumn } from "../supa";
import { ChangeTracker } from "../state";

export async function loadAliases(tracker: ChangeTracker) {
    tracker.touchPrefix(DIR_ALIASES);
    const dirs = await listDirs(DIR_ALIASES);
    const supa = client();
    const aliasSlugs = new Set<string>();
    let touched = false;

    for (const d of dirs) {
        const fp = join(d, "alias.json");
        const { data: j, hash } = await readJsonWithHash<any>(fp);
        const change = tracker.track(fp, hash, { alias_slug: j.alias_slug });

        const row = {
            alias_slug: j.alias_slug,
            api_model_id: j.resolved_api_model_id ?? j.api_model_id ?? null,
            channel: j.channel ?? "stable",
            is_enabled: !!j.is_enabled,
            notes: j.notes ?? null,
        };

        if (row.alias_slug) aliasSlugs.add(row.alias_slug);
        if (change.status === "unchanged") continue;
        touched = true;

        if (isDryRun()) {
            logWrite("public.data_api_model_aliases", "UPSERT", row, { onConflict: "alias_slug" });
            continue;
        }

        const res = await supa
            .from("data_api_model_aliases")
            .upsert(row, { onConflict: "alias_slug" });

        assertOk(res, "upsert data_api_model_aliases");
    }

    const deletions = tracker.getDeleted(DIR_ALIASES);
    touched = touched || deletions.length > 0;

    if (!touched) return;

    await pruneRowsByColumn(supa, "data_api_model_aliases", "alias_slug", aliasSlugs, "data_api_model_aliases");
}
