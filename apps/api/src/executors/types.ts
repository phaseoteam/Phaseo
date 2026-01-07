import type { Endpoint } from "@/lib/types";
import type { CoreRequest, CoreResponse } from "@/core/types";
import type { ExecutionSurface } from "@/core/surfaces";

export type ExecutionAdapter = {
    surface: ExecutionSurface;
    endpoint: Endpoint;
    toUpstream: (core: CoreRequest) => any;
    fromUpstream: (payload: any) => CoreResponse;
};
