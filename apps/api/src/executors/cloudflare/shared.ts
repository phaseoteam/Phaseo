import { getBindings } from "@/runtime/env";
import type { ExecutorExecuteArgs } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { cloudflareAccountAiBase, cloudflareByokCredential, cloudflareByokHeaders } from "@providers/cloudflare/credentials";

export function cloudflareRunUrl(model: string, accountId = getBindings().CLOUDFLARE_ACCOUNT_ID?.trim()): string {
	if (!accountId) throw new Error("cloudflare_account_id_missing");
	return `${cloudflareAccountAiBase(accountId)}/run/${model}`;
}

export async function runCloudflareModel(
	args: ExecutorExecuteArgs,
	body: BodyInit,
	contentType: string,
): Promise<{ response: Response; keySource: "gateway" | "byok"; byokKeyId: string | null }> {
	const key = resolveOpenAICompatKey({ ...args, forceGatewayKey: args.meta.forceGatewayKey });
	// A BYOK key runs on the customer's own account with their token.
	const byok = cloudflareByokCredential(key);
	const gatewayId = getBindings().CLOUDFLARE_AI_GATEWAY_ID?.trim() || "default";
	const headers: Record<string, string> = {
		Authorization: `Bearer ${key.key}`,
		"Content-Type": contentType,
		"cf-aig-gateway-id": gatewayId,
		...upstreamTestHeaders(args.meta),
	};
	const model = args.providerModelSlug || args.ir.model;
	const response = await fetchUpstream(args, cloudflareRunUrl(model, byok?.accountId), {
		method: "POST",
		headers: byok ? cloudflareByokHeaders(byok, headers) : headers,
		body,
	});
	return { response, keySource: key.source, byokKeyId: key.byokId };
}

export function unwrapCloudflareResult(payload: any): any {
	return payload && typeof payload === "object" && "result" in payload ? payload.result : payload;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let index = 0; index < bytes.length; index += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
	}
	return btoa(binary);
}

export async function blobToBase64(blob: Blob): Promise<string> {
	return arrayBufferToBase64(await blob.arrayBuffer());
}
