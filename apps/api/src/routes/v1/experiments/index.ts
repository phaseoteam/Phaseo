import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { councilRoutes } from "./council";

export const experimentsRoutes = new Hono<Env>();

experimentsRoutes.route("/experiments/council", councilRoutes);
