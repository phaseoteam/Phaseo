// Purpose: Data-plane route for TypeSafe System One evaluations.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { SystemOneSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const systemOneHandler = makeEndpointHandler({ endpoint: "systemone", schema: SystemOneSchema });

export const systemOneRoutes = new Hono<Env>();

systemOneRoutes.post("/", withRuntime(systemOneHandler));
