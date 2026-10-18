import { it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setupSimulatorRuntime } from "./src/env";
import { buildClientMatrix } from "./src/client-requests";
import { listSimProviders } from "./src/providers";
import { runRequest } from "./src/request-pipeline";
import { deliverToClient } from "./src/response-pipeline";
import { maxVariant } from "./src/response-variants";
import { COMMON_USAGE } from "./src/dialects";
import { usageProfileFor } from "./src/spec-registry";

// Ad-hoc trace: SIM_DEBUG=provider:surface:mode[:variant] prints frames and usage at each stage.
// Variant ids may contain colons themselves (finish:length, error:mid-stream).
it("debug trace", async () => {
	setupSimulatorRuntime();
	const [providerId, surface, mode, ...variantParts] = (process.env.SIM_DEBUG ?? "groq:chat:stream").split(":");
	const variantId = variantParts.join(":") || undefined;
	const matrix = buildClientMatrix();
	const provider = listSimProviders((id) => id === providerId)[0];
	const routeIndex = Number(process.env.SIM_ROUTE ?? 0);
	const route = provider.sampled[routeIndex];
	const scenario = matrix.scenarios.find((entry) => entry.id === (process.env.SIM_SCENARIO ?? `${surface}.tools.probe`))!;
	const { BASIC, FINISH_VARIANTS, ERROR_VARIANTS, REFUSAL_VARIANT } = await import("./src/response-variants");
	const max = maxVariant(undefined, usageProfileFor(providerId) ?? COMMON_USAGE);
	const variants = [max, BASIC, REFUSAL_VARIANT, ...FINISH_VARIANTS, ...ERROR_VARIANTS];
	const variant = variantId ? variants.find((v) => v.id === variantId) : max;
	if (!variant) throw new Error(`unknown variant ${variantId}; one of ${variants.map((v) => v.id).join(", ")}`);
	const run = await runRequest({ scenario, route, requestId: "req_debug", variant, clientStream: mode === "stream" });
	const out: string[] = [`route ${route.route.apiModelId} url ${run.providerCall?.url}`, `upstream body ${run.providerCall?.bodyText?.slice(0, 1500)}`];
	const outcome = await deliverToClient({ result: run.result!, mode: mode as any, surface: surface as any, body: run.parsedBody, requestId: "req_debug", route });
	out.push(`client text tail:\n${outcome.clientText.slice(-3000)}`);
	out.push(`billingUsageRaw ${JSON.stringify(outcome.billingUsageRaw)}`);
	out.push(`shapedUsage ${JSON.stringify(outcome.shapedUsage)}`);
	out.push(`pricing ${JSON.stringify(outcome.pricing && (outcome.pricing as any).ok ? (outcome.pricing as any).lines : outcome.pricing)}`);
	out.push(`frameErrors ${JSON.stringify(outcome.framePricingErrors)} finish ${outcome.finishReason}`);
	if (outcome.materialiseError) out.push(`materialiseError ${outcome.materialiseError}`);
	fs.writeFileSync(process.env.SIM_DEBUG_OUT ?? path.join(os.tmpdir(), "provider-simulator-trace.txt"), out.join("\n\n"));
});
