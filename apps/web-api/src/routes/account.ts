import { Hono } from "hono";
import { requireUser } from "@/auth/requireUser";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { creditsRouter } from "@/routes/account/credits";

export const accountRouter = new Hono<{ Bindings: Env }>();

accountRouter.route("/credits", creditsRouter);

accountRouter.get("/session", async (c) => {
  const user = await requireUser(c.req.raw, c.env);
  if (!user) {
    return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
  }

  return c.json({ user }, 200, PRIVATE_NO_STORE_HEADERS);
});
