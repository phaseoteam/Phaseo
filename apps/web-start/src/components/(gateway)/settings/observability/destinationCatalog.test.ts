import { AVAILABLE_DESTINATIONS, COMING_SOON_DESTINATIONS } from "./destinationCatalog";
import { OTLP_PRESETS } from "./broadcastDestinations";
import { resolveLogo } from "@/lib/logos";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("observability destination logos", () => {
	test("Weave retains its product branding separately from Forge inference", () => {
		const destination = AVAILABLE_DESTINATIONS.find((item) => item.label === "W&B Weave");
		expect(destination).toMatchObject({ label: "W&B Weave", logoId: "wandb-weave" });
		for (const theme of ["light", "dark"] as const) {
			expect(resolveLogo(destination!.logoId!, { theme })).toMatchObject({
				label: "W&B Weave",
				src: "/logos/weights-and-biases.svg",
			});
			expect(resolveLogo("weights-and-biases", { theme }).label).toBe("CoreWeave Forge");
		}
	});

	test("every assigned logo resolves to a local SVG asset", () => {
		for (const destination of [...AVAILABLE_DESTINATIONS, ...COMING_SOON_DESTINATIONS]) {
			if (!destination.logoId) continue;

			const logo = resolveLogo(destination.logoId);
			expect(logo.src).toMatch(/^\/.*\.svg$/);
			for (const src of Object.values(logo.assets)) {
				expect(src).toMatch(/^\/.*\.svg$/);
				expect(existsSync(join(process.cwd(), "public", src.slice(1)))).toBe(true);
			}
		}
	});
});

describe("OTLP preset forms", () => {
	test("ask for every field their preset reads, required unless it has a default", () => {
		for (const [id, preset] of Object.entries(OTLP_PRESETS)) {
			const definition = AVAILABLE_DESTINATIONS.find((destination) => destination.id === id);
			expect(definition).toBeDefined();
			const templates = [preset!.endpoint, ...Object.values(preset!.headers ?? {}), ...Object.values(preset!.resourceAttributes ?? {})];
			for (const [, placeholder] of templates.join(" ").matchAll(/\{([a-z0-9_:]+\??)\}/g)) {
				const names = placeholder.startsWith("basic:") ? placeholder.split(":").slice(1) : [placeholder];
				for (const raw of names) {
					const name = raw.replace(/\?$/, "");
					const field = definition!.fields.find((candidate) => candidate.key === name);
					expect({ id, name, found: Boolean(field) }).toEqual({ id, name, found: true });
					const required = !raw.endsWith("?") && !preset!.defaults?.[name];
					expect({ id, name, required: field!.required !== false }).toEqual({ id, name, required });
				}
			}
		}
	});
});

describe("webhook form", () => {
	test("offers the signing secret on the Webhook destination only", () => {
		const webhook = AVAILABLE_DESTINATIONS.find((destination) => destination.id === "webhook");
		expect(webhook?.fields.find((field) => field.key === "signing_secret")).toMatchObject({ type: "password", required: false });
		for (const destination of COMING_SOON_DESTINATIONS) {
			expect(destination.fields?.some((field) => field.key === "signing_secret") ?? false).toBe(false);
		}
	});
});

describe("object storage forms", () => {
	test("ask for the bucket and keys, with the path template optional", () => {
		const required: Record<string, string[]> = {
			s3: ["bucket", "access_key_id", "secret_access_key"],
			r2: ["account_id", "bucket", "access_key_id", "secret_access_key"],
			gcs: ["bucket", "access_key_id", "secret_access_key"],
		};
		for (const [id, keys] of Object.entries(required)) {
			const definition = AVAILABLE_DESTINATIONS.find((destination) => destination.id === id);
			expect(definition).toBeDefined();
			for (const key of keys) {
				const field = definition!.fields.find((candidate) => candidate.key === key);
				expect({ id, key, found: Boolean(field), required: field?.required !== false }).toEqual({ id, key, found: true, required: true });
			}
			expect(definition!.fields.find((field) => field.key === "secret_access_key")?.type).toBe("password");
			expect(definition!.fields.find((field) => field.key === "path_template")?.required).toBe(false);
		}
	});
});

describe("ClickHouse form", () => {
	test("requires the endpoint, password and table, defaulting the user and database", () => {
		const definition = AVAILABLE_DESTINATIONS.find((destination) => destination.id === "clickhouse");
		const required = Object.fromEntries(definition!.fields.map((field) => [field.key, field.required !== false]));
		expect(required).toEqual({ endpoint: true, username: false, password: true, database: false, table: true });
	});
});

describe("BigQuery form", () => {
	test("takes the key file as a secret and defaults the project", () => {
		const definition = AVAILABLE_DESTINATIONS.find((destination) => destination.id === "bigquery");
		const required = Object.fromEntries(definition!.fields.map((field) => [field.key, field.required !== false]));
		expect(required).toEqual({ service_account_json: true, dataset: true, table: true, project_id: false });
		expect(definition!.fields.find((field) => field.key === "service_account_json")?.type).toBe("password");
	});
});

describe("Snowflake form", () => {
	test("asks for key-pair sign-in and the table, with the role optional", () => {
		const definition = AVAILABLE_DESTINATIONS.find((destination) => destination.id === "snowflake");
		const required = Object.fromEntries(definition!.fields.map((field) => [field.key, field.required !== false]));
		expect(required).toEqual({ account: true, user: true, private_key: true, warehouse: true, database: true, schema: true, table: true, role: false });
		expect(definition!.fields.find((field) => field.key === "private_key")?.type).toBe("password");
		expect(definition!.fields.some((field) => field.key === "token")).toBe(false);
	});
});
