// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

import type { Condition } from "./types";

export type ConditionEvaluation = {
    condition: Condition;
    matches: boolean;
    group: number;
    explicitGroup: boolean;
};

export type ConditionEvaluationSummary = {
    totalConditions: number;
    matchedConditions: number;
    hasExplicitGroups: boolean;
    evaluations: ConditionEvaluation[];
    groupSummaries: {
        group: number;
        total: number;
        matched: number;
        containsImplicit: boolean;
    }[];
};

function getByPath(obj: any, path?: string | null): any {
    if (!obj || !path) return undefined;
    let cur = obj;
    for (const part of path.split(".")) {
        if (cur == null) return undefined;
        cur = cur[part];
    }
    return cur;
}

function evalCondition(cond: Condition, ctx: Record<string, any>): boolean {
    const val = getByPath(ctx, cond.path);
    switch (cond.op) {
        case "exists": return val !== undefined;
        case "not_exists": return val === undefined;
        case "eq": return val === cond.value;
        case "ne": return val !== cond.value;
        case "lt": return Number(val) < Number(cond.value);
        case "lte": return Number(val) <= Number(cond.value);
        case "gt": return Number(val) > Number(cond.value);
        case "gte": return Number(val) >= Number(cond.value);
        case "in": return Array.isArray(cond.value) && cond.value.includes(val);
        case "not_in": return Array.isArray(cond.value) && !cond.value.includes(val);
        case "starts_with": return typeof val === "string" && typeof cond.value === "string" && val.startsWith(cond.value);
        case "regex":
            try {
                const re = new RegExp(String(cond.value));
                return typeof val === "string" && re.test(val);
            } catch { return false; }
        default: return false;
    }
}

export function evaluateConditions(conds: Condition[] | undefined, ctx: Record<string, any>): ConditionEvaluationSummary {
    const list = conds ?? [];
    if (!list.length) {
        return {
            totalConditions: 0,
            matchedConditions: 0,
            hasExplicitGroups: false,
            evaluations: [],
            groupSummaries: [],
        };
    }

    const hasExplicitGroups = list.some((c) => typeof c.or_group === "number");
    const evaluations: ConditionEvaluation[] = [];
    const groups = new Map<number, { group: number; total: number; matched: number; containsImplicit: boolean }>();
    let matchedConditions = 0;

    for (let i = 0; i < list.length; i++) {
        const condition = list[i]!;
        const matches = evalCondition(condition, ctx);
        if (matches) matchedConditions += 1;

        const explicitGroup = typeof condition.or_group === "number";
        const group = hasExplicitGroups ? (explicitGroup ? (condition.or_group as number) : 1) : i + 1;

        let stats = groups.get(group);
        if (!stats) {
            stats = { group, total: 0, matched: 0, containsImplicit: !explicitGroup };
            groups.set(group, stats);
        } else if (!explicitGroup) {
            stats.containsImplicit = true;
        }
        stats.total += 1;
        if (matches) stats.matched += 1;

        evaluations.push({ condition, matches, group, explicitGroup });
    }

    return {
        totalConditions: list.length,
        matchedConditions,
        hasExplicitGroups,
        evaluations,
        groupSummaries: Array.from(groups.values()),
    };
}

export function matchesConditions(conds: Condition[] | undefined, ctx: Record<string, any>): boolean {
    const summary = evaluateConditions(conds, ctx);
    if (!summary.totalConditions) return true;

    // no explicit groups → simple AND
    if (!summary.hasExplicitGroups) {
        return summary.matchedConditions === summary.totalConditions;
    }

    // explicit groups → OR of ANDs:
    // match if ANY group has ALL its conditions matched
    return summary.groupSummaries.some((group) => group.matched === group.total);
}

/** Util: shallow merge (used to lift usage.context properties) */
export function shallowMerge(target: Record<string, any>, src: any) {
    if (!src || typeof src !== "object") return;
    for (const [k, v] of Object.entries(src)) target[k] = v;
}

export function getQuantityByPath(obj: any, path?: string | null): number | undefined {
    if (!path) return undefined;
    const v = getByPath(obj, path);
    return typeof v === "number" && isFinite(v) ? v : undefined;
}


