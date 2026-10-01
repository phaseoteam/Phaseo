// Purpose: Data-plane route for structured decisions.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { DecisionsSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const decisionsHandler = makeEndpointHandler({ endpoint: "decisions", schema: DecisionsSchema });

export const decisionsRoutes = new Hono<Env>();

decisionsRoutes.post("/", withRuntime(decisionsHandler));
