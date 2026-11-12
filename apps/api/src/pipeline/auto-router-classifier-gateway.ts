import type { Endpoint } from "@core/types";
import { excludeFromRequestClassification } from "./classification/request-classifiers";
import {
	buildAutoRouterClassifierRequestBody,
	parseAutoRouterClassifierResponse,
	type AutoRouterClassification,
} from "./before/auto-router";

export type AutoRouterClassifierGatewayHandler = (request: Request) => Promise<Response>;

export async function runAutoRouterClassifierGatewayRequest(args: {
	sourceRequest: Request;
	endpoint: Endpoint;
	body: unknown;
	handler: AutoRouterClassifierGatewayHandler;
}): Promise<AutoRouterClassification | null> {
	const authorization = args.sourceRequest.headers.get("authorization");
	if (!authorization) return null;
	const request = excludeFromRequestClassification(new Request("https://phaseo.local/v1/responses", {
		method: "POST",
		headers: {
			Authorization: authorization,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(buildAutoRouterClassifierRequestBody(args.body, args.endpoint)),
	}));
	try {
		const response = await args.handler(request);
		if (!response.ok) return null;
		return parseAutoRouterClassifierResponse(await response.json());
	} catch {
		return null;
	}
}
