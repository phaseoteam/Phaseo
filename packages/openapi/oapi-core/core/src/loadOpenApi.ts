import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPIV3 } from "openapi-types";

export async function loadOpenApi(inputPath: string): Promise<OpenAPIV3.Document> {
	const parser = new SwaggerParser();
	const doc = await parser.dereference(inputPath);
	return doc as OpenAPIV3.Document;
}
