import { join } from "path";
import { DIR_FAMILIES } from "../paths";
import { listDirs, readJsonWithHash } from "../util";
import { client, isDryRun, logWrite, assertOk, pruneRowsByColumn } from "../supa";
import { ChangeTracker } from "../state";

function normalizeOrganisationId(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function loadFamilies(tracker: ChangeTracker) {
    tracker.touchPrefix(DIR_FAMILIES);
    const dirs = await listDirs(DIR_FAMILIES);
    const supa = client();
    const familyIds = new Set<string>();
    let touched = false;

    const existingOrganisationIds = new Set<string>();
    const organisationByNormalized = new Map<string, string>();
    if (!isDryRun()) {
        const orgRes = await supa.from("data_organisations").select("organisation_id");
        const orgRows = assertOk(orgRes, "select data_organisations for families");
        for (const row of orgRows ?? []) {
            const id = String((row as any)?.organisation_id ?? "").trim();
            if (!id) continue;
            existingOrganisationIds.add(id);
            const normalized = normalizeOrganisationId(id);
            if (normalized && !organisationByNormalized.has(normalized)) {
                organisationByNormalized.set(normalized, id);
            }
        }
    }

    for (const d of dirs) {
        const fp = join(d, "family.json");
        const { data: j, hash } = await readJsonWithHash<any>(fp);
        const change = tracker.track(fp, hash, { family_id: j.family_id });

        let organisationId = String(j.organisation_id ?? "").trim();
        if (!isDryRun() && organisationId && !existingOrganisationIds.has(organisationId)) {
            const resolved = organisationByNormalized.get(normalizeOrganisationId(organisationId));
            if (resolved) {
                // eslint-disable-next-line no-console
                console.warn(
                    `[families-import] Remapping family organisation_id '${organisationId}' -> '${resolved}' for family '${j.family_id}'.`
                );
                organisationId = resolved;
            } else {
                // eslint-disable-next-line no-console
                console.warn(
                    `[families-import] Skipping family '${j.family_id}' because organisation_id '${organisationId}' does not exist.`
                );
                continue;
            }
        }

        const row = {
            family_id: j.family_id,
            family_name: j.family_name,
            organisation_id: organisationId || null,
            family_description: j.description ?? null,
        };

        if (row.family_id) familyIds.add(row.family_id);
        if (change.status === "unchanged") continue;
        touched = true;

        if (isDryRun()) {
            logWrite("public.data_model_families", "UPSERT", row, { onConflict: "family_id" });
            continue;
        }

        const res = await supa
            .from("data_model_families")
            .upsert(row, { onConflict: "family_id" });

        assertOk(res, "upsert data_model_families");
    }

    const deletions = tracker.getDeleted(DIR_FAMILIES);
    touched = touched || deletions.length > 0;
    if (!touched) return;

    await pruneRowsByColumn(supa, "data_model_families", "family_id", familyIds, "data_model_families");
}
