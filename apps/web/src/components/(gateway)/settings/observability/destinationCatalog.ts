export type DestinationId =
	| "arize_ai"
	| "braintrust"
	| "clickhouse"
	| "comet_opik"
	| "datadog"
	| "grafana_cloud"
	| "langfuse"
	| "langsmith"
	| "new_relic_ai"
	| "otel_collector"
	| "posthog"
	| "s3"
	| "sentry"
	| "snowflake"
	| "wandb_weave"
	| "webhook";

export type ConfigField = {
	key: string;
	label: string;
	placeholder: string;
	type?: "password" | "text";
	required?: boolean;
};

export type DestinationDefinition = {
	id: DestinationId;
	label: string;
	description: string;
	logoId?: string;
	fields: ConfigField[];
};

export type ComingSoonDestination = {
	label: string;
	logoId?: string;
	fields?: ConfigField[];
};

export const AVAILABLE_DESTINATIONS: DestinationDefinition[] = [
	{
		id: "arize_ai",
		label: "Arize AI",
		description: "Send traces to Arize with API + space credentials.",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "arize_...", type: "password" },
			{ key: "space_key", label: "Space Key", placeholder: "space-key-123" },
			{ key: "model_id", label: "Model ID", placeholder: "gateway-prod" },
			{
				key: "base_url",
				label: "Base URL (Optional)",
				placeholder: "https://otlp.arize.com/v1",
				required: false,
			},
		],
	},
	{
		id: "braintrust",
		label: "Braintrust",
		description: "Export traces into your Braintrust project.",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "bt_...", type: "password" },
			{ key: "project_id", label: "Project ID", placeholder: "proj_..." },
			{
				key: "base_url",
				label: "Base URL (Optional)",
				placeholder: "https://api.braintrust.dev",
				required: false,
			},
		],
	},
	{
		id: "clickhouse",
		label: "ClickHouse",
		description: "Insert traces directly into ClickHouse.",
		fields: [
			{ key: "endpoint", label: "HTTP Endpoint", placeholder: "https://host:8443" },
			{ key: "username", label: "Username", placeholder: "default" },
			{ key: "password", label: "Password", placeholder: "********", type: "password" },
			{ key: "database", label: "Database", placeholder: "gateway" },
			{ key: "table", label: "Table", placeholder: "traces" },
		],
	},
	{
		id: "comet_opik",
		label: "Comet Opik",
		description: "Send observability payloads to Comet Opik.",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "opik_...", type: "password" },
			{ key: "workspace", label: "Workspace", placeholder: "my-workspace" },
			{ key: "project_name", label: "Project Name", placeholder: "gateway-prod" },
		],
	},
	{
		id: "datadog",
		label: "Datadog",
		description: "Publish traces to Datadog intake.",
		logoId: "observability-datadog",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "dd_...", type: "password" },
			{ key: "ml_app", label: "ML App", placeholder: "gateway-prod" },
			{
				key: "url",
				label: "URL (Optional)",
				placeholder: "https://trace.agent.datadoghq.com",
				required: false,
			},
		],
	},
	{
		id: "grafana_cloud",
		label: "Grafana Cloud",
		description: "Push traces using Grafana OTLP credentials.",
		logoId: "observability-grafana",
		fields: [
			{
				key: "otlp_endpoint",
				label: "OTLP Endpoint",
				placeholder: "https://otlp-gateway-prod-us-central-0.grafana.net/otlp",
			},
			{ key: "instance_id", label: "Instance ID", placeholder: "1234567" },
			{ key: "api_key", label: "API Key", placeholder: "glc_...", type: "password" },
		],
	},
	{
		id: "langfuse",
		label: "Langfuse",
		description: "Forward traces to Langfuse projects.",
		logoId: "observability-langfuse",
		fields: [
			{ key: "secret_key", label: "Secret Key", placeholder: "sk-lf-...", type: "password" },
			{ key: "public_key", label: "Public Key", placeholder: "pk-lf-..." },
			{
				key: "base_url",
				label: "Base URL (Optional)",
				placeholder: "https://cloud.langfuse.com",
				required: false,
			},
		],
	},
	{
		id: "langsmith",
		label: "LangSmith",
		description: "Send traces/events to LangSmith.",
		logoId: "observability-langsmith",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "lsv2_...", type: "password" },
			{ key: "project", label: "Project", placeholder: "gateway-traces" },
			{
				key: "endpoint",
				label: "Endpoint (Optional)",
				placeholder: "https://api.smith.langchain.com",
				required: false,
			},
		],
	},
	{
		id: "new_relic_ai",
		label: "New Relic AI",
		description: "Write traces into New Relic AI monitoring.",
		fields: [
			{ key: "license_key", label: "License Key", placeholder: "NRAK-...", type: "password" },
			{ key: "region", label: "Region", placeholder: "US" },
		],
	},
	{
		id: "otel_collector",
		label: "OpenTelemetry Collector",
		description: "Stream traces over OTLP HTTP/gRPC to your collector.",
		fields: [
			{
				key: "otlp_endpoint",
				label: "Collector Endpoint",
				placeholder: "https://collector.example.com/v1/traces",
			},
			{
				key: "headers_json",
				label: "Headers JSON (Optional)",
				placeholder: "{\"Authorization\":\"Bearer ...\"}",
				required: false,
			},
		],
	},
	{
		id: "posthog",
		label: "PostHog",
		description: "Publish traces into PostHog events.",
		fields: [
			{ key: "api_key", label: "Project API Key", placeholder: "phc_...", type: "password" },
			{
				key: "endpoint",
				label: "Endpoint (Optional)",
				placeholder: "https://us.i.posthog.com",
				required: false,
			},
		],
	},
	{
		id: "s3",
		label: "S3 / S3-Compatible",
		description: "Batch traces into object storage.",
		fields: [
			{ key: "bucket", label: "Bucket", placeholder: "gateway-traces" },
			{ key: "access_key_id", label: "Access Key ID", placeholder: "AKIA..." },
			{
				key: "secret_access_key",
				label: "Secret Access Key",
				placeholder: "********",
				type: "password",
			},
			{
				key: "region",
				label: "Region (Optional)",
				placeholder: "us-east-1",
				required: false,
			},
			{
				key: "endpoint",
				label: "Endpoint (Optional)",
				placeholder: "https://s3.amazonaws.com",
				required: false,
			},
			{
				key: "session_token",
				label: "Session Token (Optional)",
				placeholder: "IQoJb3JpZ2luX2VjE...",
				type: "password",
				required: false,
			},
			{
				key: "path_template",
				label: "Path Template (Optional)",
				placeholder: "{date}/{uuid}.json",
				required: false,
			},
		],
	},
	{
		id: "sentry",
		label: "Sentry",
		description: "Forward traces to Sentry ingest endpoint.",
		logoId: "observability-sentry",
		fields: [
			{
				key: "otlp_endpoint",
				label: "OTLP Endpoint",
				placeholder: "https://o0.ingest.sentry.io/api/0/envelope/",
			},
			{
				key: "dsn",
				label: "DSN",
				placeholder: "https://...@o0.ingest.sentry.io/0",
				type: "password",
			},
		],
	},
	{
		id: "snowflake",
		label: "Snowflake",
		description: "Load traces into Snowflake for analytics.",
		logoId: "observability-snowflake",
		fields: [
			{ key: "account", label: "Account Identifier", placeholder: "xy12345.us-east-1" },
			{ key: "token", label: "Token", placeholder: "********", type: "password" },
			{ key: "database", label: "Database", placeholder: "AI_STATS" },
			{ key: "schema", label: "Schema", placeholder: "TRACES" },
			{ key: "table", label: "Table", placeholder: "EVENTS" },
			{ key: "warehouse", label: "Warehouse", placeholder: "COMPUTE_WH" },
		],
	},
	{
		id: "wandb_weave",
		label: "W&B Weave",
		description: "Send traces to Weights & Biases Weave.",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "wandb_...", type: "password" },
			{ key: "entity", label: "Entity", placeholder: "your-team" },
			{ key: "project", label: "Project", placeholder: "gateway-observability" },
			{
				key: "base_url",
				label: "Base URL (Optional)",
				placeholder: "https://api.wandb.ai",
				required: false,
			},
		],
	},
	{
		id: "webhook",
		label: "Webhook",
		description: "Send each selected trace payload to any HTTP endpoint.",
		fields: [
			{ key: "url", label: "Webhook URL", placeholder: "https://example.com/webhook" },
			{
				key: "method",
				label: "Method (Optional)",
				placeholder: "POST",
				required: false,
			},
			{
				key: "headers_json",
				label: "Headers JSON (Optional)",
				placeholder: "{\"Authorization\":\"Bearer ...\"}",
				required: false,
			},
		],
	},
];

export const COMING_SOON_DESTINATIONS: ComingSoonDestination[] = [
	{
		label: "Axiom",
		logoId: "observability-axiom",
		fields: [
			{ key: "token", label: "Token", placeholder: "xaat-...", type: "password" },
			{ key: "dataset", label: "Dataset", placeholder: "gateway-traces" },
			{
				key: "endpoint",
				label: "Endpoint (Optional)",
				placeholder: "https://api.axiom.co",
				required: false,
			},
		],
	},
	{
		label: "AWS Firehose",
		fields: [
			{ key: "stream_name", label: "Delivery Stream Name", placeholder: "gateway-traces" },
			{ key: "region", label: "Region", placeholder: "us-east-1" },
			{ key: "access_key_id", label: "Access Key ID", placeholder: "AKIA..." },
			{
				key: "secret_access_key",
				label: "Secret Access Key",
				placeholder: "********",
				type: "password",
			},
			{
				key: "session_token",
				label: "Session Token (Optional)",
				placeholder: "IQoJb3JpZ2luX2VjE...",
				type: "password",
				required: false,
			},
		],
	},
	{
		label: "Dynatrace",
		fields: [
			{
				key: "otlp_endpoint",
				label: "OTLP Endpoint",
				placeholder: "https://<env>.live.dynatrace.com/api/v2/otlp/v1/traces",
			},
			{ key: "api_token", label: "API Token", placeholder: "dt0c01....", type: "password" },
		],
	},
	{
		label: "Evidently",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "evd_...", type: "password" },
			{ key: "project_id", label: "Project ID", placeholder: "project-id" },
			{
				key: "endpoint",
				label: "Endpoint (Optional)",
				placeholder: "https://app.evidently.cloud",
				required: false,
			},
		],
	},
	{
		label: "Fiddler",
		fields: [
			{
				key: "endpoint",
				label: "Endpoint",
				placeholder: "https://api.fiddler.ai",
			},
			{ key: "auth_token", label: "Auth Token", placeholder: "fdlr_...", type: "password" },
			{
				key: "project_id",
				label: "Project ID (Optional)",
				placeholder: "project-123",
				required: false,
			},
		],
	},
	{
		label: "Galileo",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "gal_...", type: "password" },
			{ key: "project", label: "Project", placeholder: "gateway-prod" },
			{
				key: "endpoint",
				label: "Endpoint (Optional)",
				placeholder: "https://api.galileo.ai",
				required: false,
			},
		],
	},
	{
		label: "Helicone",
		fields: [
			{
				key: "api_key",
				label: "Helicone API Key",
				placeholder: "sk-helicone-...",
				type: "password",
			},
			{
				key: "base_url",
				label: "Base URL (Optional)",
				placeholder: "https://oai.helicone.ai",
				required: false,
			},
		],
	},
	{
		label: "HoneyHive",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "hh_...", type: "password" },
			{ key: "project", label: "Project", placeholder: "gateway-prod" },
		],
	},
	{
		label: "Keywords AI",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "kw_...", type: "password" },
			{
				key: "endpoint",
				label: "Endpoint (Optional)",
				placeholder: "https://api.keywordsai.co",
				required: false,
			},
		],
	},
	{
		label: "Middleware",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "mw_...", type: "password" },
			{
				key: "target",
				label: "Target Endpoint",
				placeholder: "https://api.middleware.io/v1/traces",
			},
		],
	},
	{
		label: "Mona",
		fields: [
			{ key: "client_id", label: "Client ID", placeholder: "client-..." },
			{ key: "client_secret", label: "Client Secret", placeholder: "********", type: "password" },
			{
				key: "workspace",
				label: "Workspace (Optional)",
				placeholder: "gateway-prod",
				required: false,
			},
		],
	},
	{
		label: "OpenInference",
		fields: [
			{
				key: "otlp_endpoint",
				label: "OTLP Endpoint",
				placeholder: "https://collector.example.com/v1/traces",
			},
			{
				key: "headers_json",
				label: "Headers JSON (Optional)",
				placeholder: "{\"Authorization\":\"Bearer ...\"}",
				required: false,
			},
		],
	},
	{
		label: "Phoenix",
		fields: [
			{
				key: "collector_endpoint",
				label: "Collector Endpoint",
				placeholder: "https://app.phoenix.arize.com/v1/traces",
			},
			{
				key: "api_key",
				label: "API Key (Optional)",
				placeholder: "phoenix_...",
				type: "password",
				required: false,
			},
		],
	},
	{
		label: "Portkey",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "pk_...", type: "password" },
			{
				key: "base_url",
				label: "Base URL (Optional)",
				placeholder: "https://api.portkey.ai",
				required: false,
			},
			{
				key: "workspace_slug",
				label: "Workspace Slug (Optional)",
				placeholder: "my-team",
				required: false,
			},
		],
	},
	{
		label: "Supabase",
		fields: [
			{
				key: "project_url",
				label: "Project URL",
				placeholder: "https://<project>.supabase.co",
			},
			{
				key: "service_role_key",
				label: "Service Role Key",
				placeholder: "eyJ...",
				type: "password",
			},
			{
				key: "table",
				label: "Table (Optional)",
				placeholder: "broadcast_traces",
				required: false,
			},
		],
	},
	{
		label: "WhyLabs",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "whylabs_...", type: "password" },
			{ key: "org_id", label: "Organization ID", placeholder: "org-..." },
			{ key: "model_id", label: "Model ID", placeholder: "model-..." },
			{
				key: "endpoint",
				label: "Endpoint (Optional)",
				placeholder: "https://api.whylabsapp.com",
				required: false,
			},
		],
	},
];

export function getDestinationById(provider: string): DestinationDefinition | null {
	return AVAILABLE_DESTINATIONS.find((item) => item.id === provider) ?? null;
}
