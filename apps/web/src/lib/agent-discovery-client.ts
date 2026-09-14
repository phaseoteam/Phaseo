const DEFAULT_DOCS_BASE_URL = "https://phaseo.app/docs";

const DOCS_BASE_URL = (
	process.env.NEXT_PUBLIC_DOCS_URL ?? DEFAULT_DOCS_BASE_URL
).replace(/\/+$/, "");

export const API_DOCS_URL = `${DOCS_BASE_URL}/v1/api-reference/introduction`;
export const API_QUICKSTART_URL = `${DOCS_BASE_URL}/v1/quickstart`;
