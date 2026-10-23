import {
	AVAILABLE_BROADCAST_DESTINATION_IDS,
	type BroadcastDestinationId,
} from "./broadcastDestinations";

export type DestinationId = BroadcastDestinationId;

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

const DESTINATION_DEFINITIONS: DestinationDefinition[] = [
	{
		id: "arize",
		label: "Arize AI",
		description: "Send GenAI traces to an Arize AX project over OpenTelemetry.",
		logoId: "observability-arize",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "ak-...", type: "password" },
			{ key: "space_id", label: "Space ID", placeholder: "U3BhY2U6..." },
			{ key: "project_name", label: "Project Name", placeholder: "phaseo-gateway" },
			{
				key: "base_url",
				label: "OTLP Host (Optional)",
				placeholder: "https://otlp.arize.com, or https://otlp.eu-west-1a.arize.com for EU spaces",
				required: false,
			},
		],
	},
	{
		id: "axiom",
		label: "Axiom",
		description: "Send traces to an Axiom dataset over OpenTelemetry.",
		logoId: "observability-axiom",
		fields: [
			{ key: "api_token", label: "API Token", placeholder: "xaat-...", type: "password" },
			{ key: "dataset", label: "Dataset", placeholder: "phaseo-traces" },
			{ key: "region", label: "Region (Optional)", placeholder: "US or EU, where the dataset was created", required: false },
		],
	},
	{
		id: "bigquery",
		label: "Google BigQuery",
		description: "Stream traces into a BigQuery table, one row per span.",
		logoId: "google",
		fields: [
			{
				key: "service_account_json",
				label: "Service Account Key (JSON)",
				placeholder: "Paste the key file of a service account with BigQuery Data Editor on the table",
				type: "password",
			},
			{ key: "dataset", label: "Dataset", placeholder: "observability" },
			{ key: "table", label: "Table", placeholder: "phaseo_traces" },
			{
				key: "project_id",
				label: "Project ID (Optional)",
				placeholder: "Defaults to the key's project",
				required: false,
			},
		],
	},
	{
		id: "braintrust",
		label: "Braintrust",
		description: "Send GenAI traces to a Braintrust project over OpenTelemetry.",
		logoId: "observability-braintrust",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "bt_...", type: "password" },
			{ key: "project_id", label: "Project ID", placeholder: "Project ID from the project's configuration page" },
			{
				key: "base_url",
				label: "API URL (Optional)",
				placeholder: "https://api.braintrust.dev, or https://api-eu.braintrust.dev",
				required: false,
			},
		],
	},
	{
		id: "clickhouse",
		label: "ClickHouse",
		description: "Insert traces into a ClickHouse table, one row per span.",
		logoId: "observability-clickhouse",
		fields: [
			{ key: "endpoint", label: "HTTPS Endpoint", placeholder: "https://abc123.us-east-1.aws.clickhouse.cloud:8443" },
			{ key: "username", label: "Username (Optional)", placeholder: "default", required: false },
			{ key: "password", label: "Password", placeholder: "********", type: "password" },
			{ key: "database", label: "Database (Optional)", placeholder: "default", required: false },
			{ key: "table", label: "Table", placeholder: "phaseo_traces" },
		],
	},
	{
		id: "comet_opik",
		label: "Comet Opik",
		description: "Send GenAI traces to a Comet Opik project over OpenTelemetry.",
		logoId: "observability-opik",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "Your Opik API key", type: "password" },
			{ key: "workspace", label: "Workspace", placeholder: "my-workspace" },
			{ key: "project_name", label: "Project Name", placeholder: "phaseo-gateway" },
			{
				key: "base_url",
				label: "Base URL (Optional)",
				placeholder: "https://www.comet.com/opik",
				required: false,
			},
		],
	},
	{
		id: "datadog",
		label: "Datadog",
		description: "Send GenAI traces to Datadog LLM Observability over OpenTelemetry.",
		logoId: "observability-datadog",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "dd_...", type: "password" },
			{ key: "ml_app", label: "ML App (Optional)", placeholder: "phaseo-gateway", required: false },
			{
				key: "site",
				label: "Site (Optional)",
				placeholder: "datadoghq.com, us3.datadoghq.com, us5.datadoghq.com, datadoghq.eu, ap1.datadoghq.com, ap2.datadoghq.com or uk1.datadoghq.com",
				required: false,
			},
		],
	},
	{
		id: "dynatrace",
		label: "Dynatrace",
		description: "Send traces to a Dynatrace environment over OpenTelemetry.",
		logoId: "observability-dynatrace",
		fields: [
			{ key: "environment_url", label: "Environment URL", placeholder: "https://abc12345.live.dynatrace.com" },
			{ key: "api_token", label: "Token", placeholder: "dt0c01....", type: "password" },
			{
				key: "token_type",
				label: "Token Type (Optional)",
				placeholder: "access (default) or platform",
				required: false,
			},
		],
	},
	{
		id: "elastic",
		label: "Elastic",
		description: "Send traces to Elastic Observability through its managed OTLP endpoint.",
		fields: [
			{
				key: "otlp_endpoint",
				label: "Managed OTLP Endpoint",
				placeholder: "https://my-deployment.ingest.us-east-1.aws.elastic.cloud",
			},
			{ key: "api_key", label: "API Key", placeholder: "Base64 API key", type: "password" },
		],
	},
	{
		id: "gcs",
		label: "Google Cloud Storage",
		description: "Write traces to a bucket as gzipped JSON lines, one row per span.",
		logoId: "google",
		fields: [
			{ key: "bucket", label: "Bucket", placeholder: "gateway-traces" },
			{ key: "access_key_id", label: "HMAC Access ID", placeholder: "GOOG1..." },
			{ key: "secret_access_key", label: "HMAC Secret", placeholder: "********", type: "password" },
			{
				key: "path_template",
				label: "Path Template (Optional)",
				placeholder: "phaseo/{year}/{month}/{day}/{hour}/{uuid}, must include {uuid}; .jsonl.gz is added",
				required: false,
			},
		],
	},
	{
		id: "grafana_cloud",
		label: "Grafana Cloud",
		description: "Send traces to Grafana Cloud Tempo with your stack's OpenTelemetry credentials.",
		logoId: "observability-grafana",
		fields: [
			{
				key: "otlp_endpoint",
				label: "OTLP Endpoint",
				placeholder: "https://otlp-gateway-prod-us-east-0.grafana.net/otlp",
			},
			{ key: "instance_id", label: "Instance ID", placeholder: "1234567" },
			{ key: "api_key", label: "Access Policy Token", placeholder: "glc_...", type: "password" },
		],
	},
	{
		id: "honeycomb",
		label: "Honeycomb",
		description: "Send traces to Honeycomb over OpenTelemetry.",
		fields: [
			{ key: "api_key", label: "Ingest Key", placeholder: "hcaik_...", type: "password" },
			{ key: "region", label: "Region (Optional)", placeholder: "US or EU", required: false },
			{ key: "dataset", label: "Dataset (Classic only, Optional)", placeholder: "phaseo-gateway", required: false },
		],
	},
	{
		id: "langfuse",
		label: "Langfuse",
		description: "Send GenAI traces to a Langfuse project over OpenTelemetry.",
		logoId: "observability-langfuse",
		fields: [
			{ key: "secret_key", label: "Secret Key", placeholder: "sk-lf-...", type: "password" },
			{ key: "public_key", label: "Public Key", placeholder: "pk-lf-..." },
			{
				key: "base_url",
				label: "Base URL (Optional)",
				placeholder: "https://cloud.langfuse.com, or us., jp. or hipaa.cloud.langfuse.com",
				required: false,
			},
		],
	},
	{
		id: "langsmith",
		label: "LangSmith",
		description: "Send GenAI traces to a LangSmith project over OpenTelemetry.",
		logoId: "observability-langsmith",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "lsv2_...", type: "password" },
			{ key: "project", label: "Project (Optional)", placeholder: "default", required: false },
			{
				key: "base_url",
				label: "API URL (Optional)",
				placeholder: "https://api.smith.langchain.com, or https://eu.api.smith.langchain.com",
				required: false,
			},
		],
	},
	{
		id: "new_relic",
		label: "New Relic",
		description: "Send traces to New Relic over OpenTelemetry.",
		logoId: "observability-newrelic",
		fields: [
			{ key: "license_key", label: "License Key", placeholder: "...NRAL", type: "password" },
			{ key: "region", label: "Region (Optional)", placeholder: "US, EU or JP", required: false },
		],
	},
	{
		id: "otel_collector",
		label: "OpenTelemetry Collector",
		description: "Export GenAI traces over OTLP/HTTP, as JSON or protobuf, to your collector.",
		logoId: "observability-opentelemetry",
		fields: [
			{
				key: "otlp_endpoint",
				label: "Collector Endpoint",
				placeholder: "https://collector.example.com/v1/traces",
			},
			{
				key: "otlp_protocol",
				label: "Protocol (Optional)",
				placeholder: "http/json or http/protobuf",
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
	{
		id: "posthog",
		label: "PostHog",
		description: "Send GenAI traces to PostHog LLM analytics as generation events.",
		logoId: "observability-posthog",
		fields: [
			{ key: "api_key", label: "Project Token", placeholder: "phc_...", type: "password" },
			{
				key: "base_url",
				label: "Host (Optional)",
				placeholder: "https://us.i.posthog.com or https://eu.i.posthog.com",
				required: false,
			},
		],
	},
	{
		id: "r2",
		label: "Cloudflare R2",
		description: "Write traces to an R2 bucket as gzipped JSON lines, one row per span.",
		logoId: "cloudflare",
		fields: [
			{ key: "account_id", label: "Account ID", placeholder: "32-character Cloudflare account ID" },
			{ key: "bucket", label: "Bucket", placeholder: "gateway-traces" },
			{ key: "access_key_id", label: "Access Key ID", placeholder: "R2 API token access key ID" },
			{ key: "secret_access_key", label: "Secret Access Key", placeholder: "********", type: "password" },
			{
				key: "jurisdiction",
				label: "Jurisdiction (Optional)",
				placeholder: "default, eu or fedramp, matching the bucket",
				required: false,
			},
			{
				key: "path_template",
				label: "Path Template (Optional)",
				placeholder: "phaseo/{year}/{month}/{day}/{hour}/{uuid}, must include {uuid}; .jsonl.gz is added",
				required: false,
			},
		],
	},
	{
		id: "respan",
		label: "Respan",
		description: "Send GenAI traces to Respan over OpenTelemetry.",
		logoId: "respan",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "Your Respan API key", type: "password" },
			{
				key: "base_url",
				label: "Base URL (Optional)",
				placeholder: "https://api.respan.ai",
				required: false,
			},
		],
	},
	{
		id: "s3",
		label: "Amazon S3 / S3-Compatible",
		description: "Write traces to a bucket as gzipped JSON lines, one row per span.",
		logoId: "aws",
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
				label: "S3-Compatible Endpoint (Optional)",
				placeholder: "https://minio.example.com, for stores other than AWS",
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
				placeholder: "phaseo/{year}/{month}/{day}/{hour}/{uuid}, must include {uuid}; .jsonl.gz is added",
				required: false,
			},
		],
	},
	{
		id: "sentry",
		label: "Sentry",
		description: "Send traces to a Sentry project's OTLP endpoint.",
		logoId: "observability-sentry",
		fields: [
			{
				key: "otlp_endpoint",
				label: "OTLP Traces Endpoint",
				placeholder: "https://o0.ingest.sentry.io/api/0/integration/otlp/v1/traces",
			},
			{
				key: "public_key",
				label: "Public Key",
				placeholder: "From Client Keys (DSN)",
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
			{ key: "database", label: "Database", placeholder: "PHASEO" },
			{ key: "schema", label: "Schema", placeholder: "TRACES" },
			{ key: "table", label: "Table", placeholder: "EVENTS" },
			{ key: "warehouse", label: "Warehouse", placeholder: "COMPUTE_WH" },
		],
	},
	{
		id: "wandb_weave",
		label: "W&B Weave",
		description: "Send GenAI traces to a W&B Weave project's Agents view.",
		logoId: "wandb-weave",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "wandb_...", type: "password" },
			{ key: "entity", label: "Entity", placeholder: "your-team" },
			{ key: "project", label: "Project", placeholder: "gateway-observability" },
			{
				key: "base_url",
				label: "Base URL (Optional)",
				placeholder: "https://trace.wandb.ai",
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
			{
				key: "signing_secret",
				label: "Signing Secret (Optional)",
				placeholder: "16+ characters, used to sign x-phaseo-signature",
				required: false,
				type: "password",
			},
		],
	},
];

const EXECUTABLE_DESTINATION_IDS = new Set<DestinationId>(AVAILABLE_BROADCAST_DESTINATION_IDS);

export const AVAILABLE_DESTINATIONS: DestinationDefinition[] = DESTINATION_DEFINITIONS.filter(
	(destination) => EXECUTABLE_DESTINATION_IDS.has(destination.id),
);

export const COMING_SOON_DESTINATIONS: ComingSoonDestination[] = [
	...DESTINATION_DEFINITIONS
		.filter((destination) => !EXECUTABLE_DESTINATION_IDS.has(destination.id))
		.map(({ label, logoId, fields }) => ({ label, logoId, fields })),
	{
		label: "AWS Firehose",
		logoId: "aws",
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
		logoId: "observability-fiddler",
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
		label: "HoneyHive",
		logoId: "observability-honeyhive",
		fields: [
			{ key: "api_key", label: "API Key", placeholder: "hh_...", type: "password" },
			{ key: "project", label: "Project", placeholder: "gateway-prod" },
		],
	},
	{
		label: "Middleware",
		logoId: "observability-middleware",
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
		logoId: "observability-mona",
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
		logoId: "observability-opentelemetry",
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
		logoId: "observability-arize",
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
		label: "Supabase",
		logoId: "observability-supabase",
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
		logoId: "observability-whylabs",
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
