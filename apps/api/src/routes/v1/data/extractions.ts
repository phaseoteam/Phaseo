import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { ExtractionsSchema } from "@core/extraction";
import { withRuntime } from "../../utils";

export const extractionsRoutes = new Hono<Env>();
extractionsRoutes.post("/", withRuntime(makeEndpointHandler({ endpoint: "extractions", schema: ExtractionsSchema })));
