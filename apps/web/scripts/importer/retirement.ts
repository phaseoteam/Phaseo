import { assertOk, type client } from "./supa";
import { chunk } from "./util";

type RetainedTable = "v2_models" | "v2_model_provider_routes" | "v2_model_aliases"
    | "v2_pricing_skus" | "v2_benchmark_results" | "v2_subscription_plan_models"
    | "v2_subscription_plans" | "v2_route_capabilities";

export function retirementValues(table: RetainedTable, row: Record<string, any>, now: string) {
    const dateColumn = table === "v2_models" ? "retired_at" : "effective_to";
    const previousEnd = row[dateColumn];
    const end = previousEnd && Date.parse(previousEnd) <= Date.parse(now)
        ? previousEnd
        : new Date(Math.max(Date.parse(now), (Date.parse(row.effective_from ?? "") || 0) + 1)).toISOString();
    const values: Record<string, any> = { [dateColumn]: end };
    if (table === "v2_models") Object.assign(values, { hidden: true, status: "retired", catalogue_status: "retired" });
    if (table === "v2_model_provider_routes") Object.assign(values, { status: "disabled", routing_enabled: false });
    if (table === "v2_model_aliases") values.enabled = false;
    if (table === "v2_route_capabilities") values.status = "disabled";
    if (table === "v2_pricing_skus") {
        values.status = row.status === "disabled" || Date.parse(row.effective_from ?? "") >= Date.parse(now)
            ? "disabled" : "deprecated";
    }
    const changed = Object.fromEntries(Object.entries(values).filter(([key, value]) =>
        row[key] !== value && !(key === dateColumn && Date.parse(row[key]) === Date.parse(value)),
    ));
    return Object.keys(changed).length ? changed : null;
}

export async function retireCatalogueRows(
    supa: ReturnType<typeof client>,
    table: RetainedTable,
    identityColumns: string[],
    rows: Record<string, any>[],
    now = new Date().toISOString(),
) {
    const groups = new Map<string, { values: Record<string, any>; rows: Record<string, any>[] }>();
    for (const row of rows) {
        const values = retirementValues(table, row, now);
        if (!values) continue;
        const key = JSON.stringify(values);
        const group = groups.get(key) ?? { values, rows: [] };
        group.rows.push(row);
        groups.set(key, group);
    }
    for (const { values, rows: group } of groups.values()) {
        if (identityColumns.length === 1) {
            const [column] = identityColumns;
            for (const batch of chunk(group, 200)) {
                assertOk(await supa.from(table).update(values).in(column, batch.map(row => row[column])), `v2 sync retire stale ${table}`);
            }
        } else {
            for (const row of group) {
                let query = supa.from(table).update(values);
                for (const column of identityColumns) query = query.eq(column, row[column]);
                assertOk(await query, `v2 sync retire stale ${table}`);
            }
        }
    }
}
