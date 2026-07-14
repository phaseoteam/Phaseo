import { Hono } from "hono";
import type { Env } from "@/env";
import { publicStatusRouter } from "./status";
import { publicModelsRouter } from "./models";
import { publicReferenceDataRouter } from "./reference-data";
import { publicCollectionsRouter } from "./collections";

export const publicRouter = new Hono<{ Bindings: Env }>();
publicRouter.route("/", publicStatusRouter);
publicRouter.route("/models", publicModelsRouter);
publicRouter.route("/", publicReferenceDataRouter);
publicRouter.route("/", publicCollectionsRouter);
