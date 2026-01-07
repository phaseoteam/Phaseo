import type { CoreRequest } from "./types";
import type { ExecutionSurface } from "./surfaces";
import { surfaceSupports } from "./surfaces";
import { classifyParam } from "@/router/param_classifier";

export type StrictnessMode = "off" | "warn" | "error";

export type StrictnessResult = {
    request: CoreRequest;
    warnings: string[];
    blocked: boolean;
    reason?: string;
};

function warnKey(key: string) {
    return `${key}_dropped`;
}

export function applyStrictness(
    request: CoreRequest,
    surface: ExecutionSurface,
    strictness: StrictnessMode
): StrictnessResult {
    const warnings: string[] = [];
    let blocked = false;
    let reason: string | undefined;
    const next: CoreRequest = { ...request };

    if (request.response && !surfaceSupports(surface, "supportsResponseFormat")) {
        const tier = classifyParam("response_format");
        if (strictness === "error" && tier === "critical") {
            blocked = true;
            reason = "response_format_not_supported";
        } else {
            delete next.response;
            warnings.push(warnKey("response_format"));
        }
    }

    if (request.tools && !surfaceSupports(surface, "supportsTools")) {
        const tier = classifyParam("tools");
        if (strictness === "error" && tier === "critical") {
            blocked = true;
            reason = "tools_not_supported";
        } else {
            delete next.tools;
            warnings.push(warnKey("tools"));
        }
    }

    if (request.tool_choice && !surfaceSupports(surface, "supportsTools")) {
        const tier = classifyParam("tool_choice");
        if (strictness === "error" && tier === "critical") {
            blocked = true;
            reason = "tool_choice_not_supported";
        } else {
            delete next.tool_choice;
            warnings.push(warnKey("tool_choice"));
        }
    }

    return {
        request: next,
        warnings,
        blocked,
        reason,
    };
}
